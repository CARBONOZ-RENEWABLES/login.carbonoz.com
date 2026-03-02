import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TotalEnergy, User } from '@prisma/client';
import { format, parseISO } from 'date-fns';
import * as FormData from 'form-data';
import { lastValueFrom } from 'rxjs';
import { IAppConfig } from 'src/__shared__/interfaces';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  Redex400ErrorResponse,
  Redex422ErrorResponse,
  RedexAuthResponse,
  RedexFileUplaodResponse,
  RedexgenerateMonthlydataResponse,
  RedexRegDeviceResponse,
  RedexRegisterDeviceDto,
} from './interface';

@Injectable()
export class RedexService {
  private readonly logger = new Logger(RedexService.name);
  constructor(
    private readonly prismaService: PrismaService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService<IAppConfig>,
  ) {}

  private async adjustTotals(result: TotalEnergy[]) {
    // Sort results by date
    result.sort(
      (a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime(),
    );

    const lastValuesMap = new Map<string, TotalEnergy>();
    for (const entry of result) {
      lastValuesMap.set(entry.date, entry);
    }

    const updatedResult: { date: string; pvPower: string }[] = [];
    const dates = Array.from(lastValuesMap.keys());

    for (let i = 0; i < dates.length; i++) {
      const todayDate = dates[i];
      const todayData = lastValuesMap.get(todayDate);
      const yesterdayData = lastValuesMap.get(dates[i - 1]);

      if (yesterdayData) {
        // Calculate difference
        const pvPowerDifference = (
          parseFloat(todayData.pvPower) - parseFloat(yesterdayData.pvPower)
        ).toFixed(2);

        // Only use difference if it's greater than zero
        updatedResult.push({
          date: todayDate,
          pvPower:
            parseFloat(pvPowerDifference) > 0
              ? pvPowerDifference
              : todayData.pvPower,
        });
      } else {
        // For the first entry or entries without a previous day
        updatedResult.push({
          date: todayDate,
          pvPower: todayData.pvPower,
        });
      }
    }

    return updatedResult;
  }

  async generateRedexToken() {
    const redexConfig = this.configService.get('redex');
    if (!redexConfig?.url || !redexConfig?.apiKey) {
      throw new BadRequestException('Redex configuration is missing');
    }

    const body = {
      GrantType: 'api_key',
      ApiKey: redexConfig.apiKey,
      ClientId: redexConfig.clientId,
      ClientSecret: redexConfig.clientSecret,
    };

    try {
      const authResponse = (
        await lastValueFrom(
          this.httpService.post<RedexAuthResponse>(
            `${this.configService.get('redex').url}/connect/token`,
            body,
            {
              headers: {
                'Content-Type': 'application/json',
              },
            },
          ),
        )
      ).data;
      return authResponse.Data.AccessToken;
    } catch (error) {
      this.logger.error('Error generating Redex token', error);
      if (error.response) {
        this.logger.error('Error response data:', error.response.data);
        this.logger.error('Error response status:', error.response.status);
        this.logger.error('Error response headers:', error.response.headers);
      } else if (error.request) {
        this.logger.error('No response received:', error.request);
      } else {
        this.logger.error('Axios error:', error.message);
      }
      throw new BadRequestException({
        message: 'Failed to generate Redex token',
        error: error.message,
      });
    }
  }

  async uplaodFile(file: Express.Multer.File, user: User): Promise<string> {
    const token = await this.generateRedexToken();
    const formData = new FormData();
    formData.append('File', file.buffer, {
      filename: file.originalname,
      contentType: file.mimetype,
    });

    const headers = {
      ...formData.getHeaders(),
      Authorization: `Bearer ${token}`,
    };

    try {
      const response = (
        await lastValueFrom(
          this.httpService.post<RedexFileUplaodResponse>(
            `${this.configService.get('redex').url}/documents/devices`,
            formData,
            { headers },
          ),
        )
      ).data;
      await this.prismaService.redexInformation.create({
        data: {
          userId: user.id,
          redexFileId: response.Data.Id,
          ValidationCode: response.Data.ValidationCode,
        },
      });
      return response.Data.Id;
    } catch (error) {
      this.logger.error('Error uplaoding Redex file', error);
      if (error.response) {
        this.logger.error('Error response data:', error.response.data);
        this.logger.error('Error response status:', error.response.status);
        this.logger.error('Error response headers:', error.response.headers);
      } else if (error.request) {
        this.logger.error('No response received:', error.request);
      } else {
        this.logger.error('Axios error:', error.message);
      }
      throw new BadRequestException({
        message: 'Failed to upload file to  Redex',
        error: error.message,
      });
    }
  }

  async registerGroupDevice(dto: RedexRegisterDeviceDto, user?: User) {
    try {
      const redexDevice = await this.prismaService.redexRegisterDevice.create({
        data: {
          userId: user.id,
          countryCode: dto.CountryCode,
          groupedEnglishName: dto.GroupedEnglishName,
          groupedLocalName: dto.GroupedLocalName,
          province: dto.Province,
          timezone: dto.Timezone,
          generationDataFrequency: dto.GenerationDataFrequency,
          devices: {
            create: dto.Devices.map((device) => ({
              installationName: device.InstallationName,
              address: device.Address,
              postalCode: device.PostalCode,
              longitude: device.Longitude,
              latitude: device.Latitude,
              gridConnectionDate: new Date(device.GridConnectionDate),
              ownersDeclarationStartDate: new Date(
                device.OwnersDeclarationStartDate,
              ),
              ownersDeclarationEndDate: device.OwnersDeclarationEndDate
                ? new Date(device.OwnersDeclarationEndDate)
                : null,
              domestic: device.Domestic,
              feedInTariff: device.FeedInTariff,
              declarationFormFileId: device.DeclarationFormFileId,
              percentageRenewable: device.PercentageRenewable,
              inverters: {
                create: device.Inverters.map((inverter) => ({
                  remoteInvId: inverter.RemoteInvId,
                  electronicSerialNumber: inverter.ElectronicSerialNumber,
                  brandCode: inverter.BrandCode,
                  otherBrandName: inverter.OtherBrandName,
                  installedCapacity: inverter.InstalledCapacity,
                })),
              },
            })),
          },
        },
      });

      const redexFileId = dto.Devices.map(
        (device) => device.DeclarationFormFileId,
      );
      const row = await this.prismaService.redexInformation.findFirst({
        where: {
          redexFileId: String(redexFileId),
        },
      });
      if (row) {
        const Devices = dto.Devices.map((device) => device.Inverters);
        const invArrayFlat = Devices.flatMap((item) => item);
        const inArray: Array<string> = [];
        invArrayFlat.forEach((item) => {
          inArray.push(item.RemoteInvId);
        });
        await this.prismaService.redexInformation.update({
          where: {
            id: row.id,
          },
          data: {
            remoteInvIds: inArray,
          },
        });
      }

      return redexDevice;
    } catch (error) {
      this.logger.error('Error registering device:', error);
      throw new BadRequestException({
        message: 'Failed to register device',
        error: error.message,
      });
    }

    // const body = {
    //   ...dto,
    // };
    // try {
    //   const registrationResponse = (
    //     await lastValueFrom(
    //       this.httpService.post<RedexRegDeviceResponse>(
    //         `${
    //           this.configService.get('redex').url
    //         }/device-applications/i-rec/grouped`,
    //         body,
    //         {
    //           headers: {
    //             'Content-Type': 'application/json',
    //             Authorization: `Bearer ${token}`,
    //           },
    //         },
    //       ),
    //     )
    //   ).data;
    //   const redexFileId = dto.Devices.map(
    //     (device) => device.DeclarationFormFileId,
    //   );
    //   const row = await this.prismaService.redexInformation.findFirst({
    //     where: {
    //       redexFileId: String(redexFileId),
    //     },
    //   });
    //   const Devices = dto.Devices.map((device) => device.Inverters);
    //   const invArrayFlat = Devices.flatMap((item) => item);
    //   const inArray: Array<string> = [];
    //   invArrayFlat.forEach((item) => {
    //     inArray.push(item.RemoteInvId);
    //   });
    //   await this.prismaService.redexInformation.update({
    //     where: {
    //       id: row.id,
    //     },
    //     data: {
    //       remoteInvIds: inArray,
    //     },
    //   });
    //   return registrationResponse;
    // } catch (error) {
    //   this.logger.error('Error registering devices', error);
    //   if (error.response) {
    //     this.logger.error('Error response data:', error.response.data);
    //     this.logger.error('Error response status:', error.response.status);
    //     this.logger.error('Error response headers:', error.response.headers);
    //   } else if (error.request) {
    //     this.logger.error('No response received:', error.request);
    //   } else {
    //     this.logger.error('Axios error:', error.message);
    //   }
    //   throw new BadRequestException({
    //     message: 'Failed to register Device',
    //     error: error.message,
    //   });
    // }
  }

  async getUserFileId(user: User) {
    const userFile = await this.prismaService.redexInformation.findFirst({
      where: {
        userId: user.id,
      },
    });
    return userFile?.redexFileId || null;
  }

  async getMonthlyData() {
    const remoteInvIds = await this.prismaService.redexInformation.findMany({
      include: {
        user: {
          select: {
            id: true,
          },
        },
      },
    });

    const responses = [];

    const allMonths = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];

    for (const remoteInv of remoteInvIds) {
      const userId = remoteInv.user.id;
      const remoteInvIdsArray = remoteInv.remoteInvIds;

      const results = await this.prismaService.totalEnergy.findMany({
        where: { userId },
      });

      const adjustedResults = await this.adjustTotals(results);

      const monthlyProduction: { [month: string]: number } = {};
      const year = new Date().getFullYear();
      for (const month of allMonths) {
        monthlyProduction[month] = 0;
      }

      for (const entry of adjustedResults) {
        const month = format(parseISO(entry.date), 'MMM');
        const pvPower = parseFloat(entry.pvPower || '0');

        if (!monthlyProduction[month]) {
          monthlyProduction[month] = 0;
        }
        monthlyProduction[month] += pvPower;
      }

      for (const month in monthlyProduction) {
        monthlyProduction[month] = parseFloat(
          monthlyProduction[month].toFixed(3),
        );
      }

      for (const remoteInvId of remoteInvIdsArray) {
        responses.push({
          RemoteInvId: remoteInvId,
          Data: {
            Year: year,
            PeriodProductionPerMonthInKWh: { ...monthlyProduction },
          },
        });
      }
    }

    if (responses.length === 0) {
      responses.push({
        RemoteInvId: '',
        Data: {
          Year: new Date().getFullYear(),
          PeriodProductionPerMonthInKWh: {},
        },
      });
    }

    const token = await this.generateRedexToken();

    const body = responses;

    try {
      const sendingResponse = (
        await lastValueFrom(
          this.httpService.post<RedexgenerateMonthlydataResponse>(
            `${
              this.configService.get('redex').url
            }/generation-datas/monthly-data`,
            body,
            {
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
            },
          ),
        )
      ).data;

      if (sendingResponse.StatusCode === 201) {
        console.log('sent');
      }
    } catch (error) {
      this.logger.error('Error sendind monthly  devices Data', error);

      if (error.response) {
        const statusCode = error.response.status;

        if (statusCode === 422) {
          const errorData: Redex422ErrorResponse = error.response.data;
          this.logger.error('422 Error response data:', errorData.Errors);
        } else if (statusCode === 400) {
          const errorData: Redex400ErrorResponse = error.response.data;
          this.logger.error('400 Error response data:', errorData.Message);
        } else {
          this.logger.error('Error response data:', error.response.data);
        }

        this.logger.error('Error response status:', statusCode);
        this.logger.error('Error response headers:', error.response.headers);
      } else if (error.request) {
        this.logger.error('No response received:', error.request);
      } else {
        this.logger.error('Axios error:', error.message);
      }
    }

    return;
  }

  async sendRegisteredDeviceToRedex() {
    const token = await this.generateRedexToken();

    const allDevices = await this.prismaService.redexRegisterDevice.findMany({
      where: {
        deviceRegistered: false,
      },
      include: {
        devices: {
          include: {
            inverters: true,
          },
        },
      },
    });

    if (allDevices.length === 0) {
      throw new BadRequestException('No data to be sent ');
    } else {
      try {
        for (const deviceGroup of allDevices) {
          const body = {
            CountryCode: deviceGroup.countryCode,
            GroupedEnglishName: deviceGroup.groupedEnglishName,
            GroupedLocalName: deviceGroup.groupedLocalName,
            Province: deviceGroup.province,
            Timezone: deviceGroup.timezone,
            GenerationDataFrequency: deviceGroup.generationDataFrequency,
            Devices: deviceGroup.devices.map((device) => ({
              InstallationName: device.installationName,
              Address: device.address,
              PostalCode: device.postalCode,
              Longitude: device.longitude,
              Latitude: device.latitude,
              GridConnectionDate: format(
                device.gridConnectionDate,
                'yyyy-MM-dd',
              ),
              OwnersDeclarationStartDate: format(
                device.ownersDeclarationStartDate,
                'yyyy-MM-dd',
              ),
              OwnersDeclarationEndDate: format(
                device.ownersDeclarationEndDate,
                'yyyy-MM-dd',
              ),
              Domestic: device.domestic,
              FeedInTariff: device.feedInTariff,
              DeclarationFormFileId: device.declarationFormFileId,
              PercentageRenewable: device.percentageRenewable,
              Inverters: device.inverters.map((inverter) => ({
                RemoteInvId: inverter.remoteInvId,
                ElectronicSerialNumber: inverter.electronicSerialNumber,
                BrandCode: inverter.brandCode,
                OtherBrandName: inverter.otherBrandName,
                InstalledCapacity: inverter.installedCapacity,
              })),
            })),
          };

          const response = await lastValueFrom(
            this.httpService.post<RedexRegDeviceResponse>(
              `${
                this.configService.get('redex').url
              }/device-applications/i-rec/grouped`,
              body,
              {
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`,
                },
              },
            ),
          );
          if (response) {
            await this.prismaService.redexRegisterDevice.update({
              where: { id: deviceGroup.id },
              data: { deviceRegistered: true },
            });
          }
        }
      } catch (error) {
        this.logger.error('Error registering devices', error);
        if (error.response) {
          this.logger.error('Error response data:', error.response.data);
          this.logger.error('Error response status:', error.response.status);
          this.logger.error('Error response headers:', error.response.headers);
        } else if (error.request) {
          this.logger.error('No response received:', error.request);
        } else {
          this.logger.error('Axios error:', error.message);
        }
        throw new BadRequestException({
          message: 'Failed to register Device',
          error: error.message,
        });
      }
    }
  }
}
