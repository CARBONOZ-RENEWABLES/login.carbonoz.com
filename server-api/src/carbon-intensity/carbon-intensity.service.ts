import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CarbonIntensityQueryDTO } from './dto';
import axios from 'axios';
import * as moment from 'moment-timezone';

@Injectable()
export class CarbonIntensityService {
  constructor(private readonly prisma: PrismaService) {}

  async getCarbonIntensityData(user: User, dto: CarbonIntensityQueryDTO, days: number) {
    const { zone, timezone = 'UTC' } = dto;

    // Get carbon intensity API key from Redis
    const carbonApiKey = await this.getCarbonApiKeyFromRedis(user.id);
    if (!carbonApiKey) {
      throw new Error('Carbon intensity API key not configured');
    }

    // Fetch carbon intensity history from Electricity Map API
    const carbonIntensityHistory = await this.fetchCarbonIntensityHistory(zone, carbonApiKey, days);

    // Get energy data from database
    const energyData = await this.getEnergyData(user.id, days, timezone);

    // Calculate emissions using the same logic as Home Assistant/Docker/Desktop apps
    const emissionsData = this.calculateEmissions(carbonIntensityHistory, energyData);

    // Calculate summary statistics
    const summary = this.calculateSummary(emissionsData);

    return {
      ...summary,
      last7Days: days === 7 ? emissionsData : [],
      last30Days: days === 30 ? emissionsData : [],
      last12Months: days === 365 ? emissionsData : [],
    };
  }

  private async getCarbonApiKeyFromRedis(userId: string): Promise<string | null> {
    // TODO: Implement Redis lookup for carbon-settings hash
    // For now, return null - this will be implemented when Redis integration is ready
    return null;
  }

  private async fetchCarbonIntensityHistory(zone: string, apiKey: string, days: number): Promise<any[]> {
    const historyData = [];
    const today = moment();
    const startDate = moment().subtract(days, 'days');

    try {
      for (let m = moment(startDate); m.isBefore(today); m.add(1, 'day')) {
        const date = m.format('YYYY-MM-DD');
        try {
          const response = await axios.get('https://api.electricitymap.org/v3/carbon-intensity/history', {
            params: { zone, datetime: date },
            headers: { 'auth-token': apiKey },
            timeout: 10000,
          });

          if (response.data.history && response.data.history.length > 0) {
            historyData.push({
              date,
              carbonIntensity: response.data.history[0].carbonIntensity,
            });
          }
        } catch (error) {
          console.error(`Error fetching carbon intensity for ${date}:`, error.message);
        }
      }
    } catch (error) {
      console.error('Error fetching carbon intensity history:', error);
    }

    return historyData;
  }

  private async getEnergyData(userId: string, days: number, timezone: string) {
    const startDate = moment().tz(timezone).subtract(days, 'days').startOf('day').toDate();
    const endDate = moment().tz(timezone).endOf('day').toDate();

    const energyRecords = await this.prisma.totalEnergy.findMany({
      where: {
        userId,
        date: {
          gte: startDate.toISOString(),
          lte: endDate.toISOString(),
        },
      },
      orderBy: { date: 'asc' },
    });

    return energyRecords;
  }

  private calculateEmissions(carbonIntensityHistory: any[], energyData: any[]) {
    if (!carbonIntensityHistory || !energyData || carbonIntensityHistory.length === 0 || energyData.length === 0) {
      return [];
    }

    return carbonIntensityHistory.map((dayData, index) => {
      const carbonIntensity = dayData.carbonIntensity || 0;
      const historyDate = dayData.date;

      // Find matching energy data
      let dataIndex = -1;
      for (let i = 0; i < energyData.length; i++) {
        const entryDate = moment(energyData[i].date).format('YYYY-MM-DD');
        if (entryDate === historyDate) {
          dataIndex = i;
          break;
        }
      }

      if (dataIndex === -1 || dataIndex === 0) {
        // No data found or first entry
        return {
          date: dayData.date,
          carbonIntensity: carbonIntensity,
          gridEnergy: 0,
          solarEnergy: 0,
          unavoidableEmissions: 0,
          avoidedEmissions: 0,
          selfSufficiencyScore: 0,
        };
      }

      // Apply EXACT same logic as Home Assistant/Docker/Desktop apps
      const i = dataIndex;

      const currentLoadPower = parseFloat(energyData[i]?.loadPower || '0.0');
      const previousLoadPower = parseFloat(energyData[i - 1]?.loadPower || '0.0');

      const currentPvPower = parseFloat(energyData[i]?.pvPower || '0.0');
      const previousPvPower = parseFloat(energyData[i - 1]?.pvPower || '0.0');

      const currentBatteryCharged = parseFloat(energyData[i]?.batteryCharged || '0.0');
      const previousBatteryCharged = parseFloat(energyData[i - 1]?.batteryCharged || '0.0');

      const currentBatteryDischarged = parseFloat(energyData[i]?.batteryDischarged || '0.0');
      const previousBatteryDischarged = parseFloat(energyData[i - 1]?.batteryDischarged || '0.0');

      const currentGridUsed = parseFloat(energyData[i]?.gridIn || '0.0');
      const previousGridUsed = parseFloat(energyData[i - 1]?.gridIn || '0.0');

      const currentGridExported = parseFloat(energyData[i]?.gridOut || '0.0');
      const previousGridExported = parseFloat(energyData[i - 1]?.gridOut || '0.0');

      // Check if all current values are greater than previous values
      const allGreaterThanPrevious =
        previousLoadPower > 0 && currentLoadPower > previousLoadPower &&
        previousPvPower > 0 && currentPvPower > previousPvPower &&
        previousBatteryCharged > 0 && currentBatteryCharged > previousBatteryCharged &&
        previousBatteryDischarged > 0 && currentBatteryDischarged > previousBatteryDischarged &&
        previousGridUsed > 0 && currentGridUsed > previousGridUsed &&
        previousGridExported > 0 && currentGridExported > previousGridExported;

      let dailyGridUsed, dailyPvPower;

      if (allGreaterThanPrevious) {
        // If all metrics increased, calculate differences
        dailyGridUsed = currentGridUsed - previousGridUsed;
        dailyPvPower = currentPvPower - previousPvPower;
      } else {
        // Otherwise, use current values as is
        dailyGridUsed = currentGridUsed;
        dailyPvPower = currentPvPower;
      }

      // Calculate emissions
      const unavoidableEmissions = (dailyGridUsed * carbonIntensity) / 1000;
      const avoidedEmissions = (dailyPvPower * carbonIntensity) / 1000;
      const totalEnergy = dailyGridUsed + dailyPvPower;
      const selfSufficiencyScore = totalEnergy > 0 ? (dailyPvPower / totalEnergy) * 100 : 0;

      return {
        date: dayData.date,
        carbonIntensity: Math.round(carbonIntensity * 10) / 10,
        gridEnergy: Math.round(dailyGridUsed * 10) / 10,
        solarEnergy: Math.round(dailyPvPower * 10) / 10,
        unavoidableEmissions: Math.round(unavoidableEmissions * 100) / 100,
        avoidedEmissions: Math.round(avoidedEmissions * 100) / 100,
        selfSufficiencyScore: Math.round(selfSufficiencyScore * 10) / 10,
      };
    });
  }

  private calculateSummary(emissionsData: any[]) {
    if (!emissionsData || emissionsData.length === 0) {
      return {
        totalUnavoidableEmissions: 0,
        totalAvoidedEmissions: 0,
        avgCarbonIntensity: 0,
        selfSufficiencyScore: 0,
      };
    }

    const totalUnavoidableEmissions = emissionsData.reduce((sum, item) => sum + item.unavoidableEmissions, 0);
    const totalAvoidedEmissions = emissionsData.reduce((sum, item) => sum + item.avoidedEmissions, 0);
    const avgCarbonIntensity = emissionsData.reduce((sum, item) => sum + item.carbonIntensity, 0) / emissionsData.length;
    const avgSelfSufficiency = emissionsData.reduce((sum, item) => sum + item.selfSufficiencyScore, 0) / emissionsData.length;

    return {
      totalUnavoidableEmissions: Math.round(totalUnavoidableEmissions * 100) / 100,
      totalAvoidedEmissions: Math.round(totalAvoidedEmissions * 100) / 100,
      avgCarbonIntensity: Math.round(avgCarbonIntensity * 10) / 10,
      selfSufficiencyScore: Math.round(avgSelfSufficiency * 10) / 10,
    };
  }
}
