import { Injectable } from '@nestjs/common';
import { Project, User } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { ProjectDto } from './dto';

@Injectable()
export class ProjectService {
  constructor(private prismaService: PrismaService) {}

  async addProject(dto: ProjectDto, user: User): Promise<Project> {
    const existing = await this.prismaService.project.findFirst({
      where: { userId: user.id },
      select: { id: true },
    });
    return existing
      ? this.prismaService.project.update({
          where: { id: existing.id },
          data: dto,
        })
      : this.prismaService.project.create({
          data: { ...dto, userId: user.id },
        });
  }

  async getProject(user: User): Promise<Project> {
    return await this.prismaService.project.findFirst({
      where: {
        userId: user.id,
      },
    });
  }
}
