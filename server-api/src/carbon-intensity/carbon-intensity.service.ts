import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CarbonIntensityQueryDTO } from './dto';
import axios from 'axios';
import * as moment from 'moment-timezone';

@Injectable()
export class CarbonIntensityService {
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 3600000; // 1 hour in milliseconds

  constructor(private readonly prisma: PrismaService) {}

  async getCarbonIntensityData(user: User, dto: CarbonIntensityQueryDTO, days: number) {
    const { zone, timezone = 'UTC' } = dto;

    // Create cache key
    const cacheKey = `${user.id}-${zone}-${days}-${timezone}`;
    
    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      console.log(`Cache hit for ${cacheKey}`);
      return cached.data;
    }

    const carbonApiKey = await this.getCarbonApiKeyFromRedis(user.id);
    if (!carbonApiKey) {
      throw new Error('Carbon intensity API key not configured');
    }

    // Fetch data in parallel
    const [carbonIntensityHistory, energyData] = await Promise.all([
      this.fetchCarbonIntensityHistory(zone, carbonApiKey, days),
      this.getEnergyData(user.id, days, timezone)
    ]);

    const emissionsData = this.calculateEmissions(carbonIntensityHistory, energyData);
    const summary = this.calculateSummary(emissionsData);

    const result = {
      ...summary,
      last7Days: days === 7 ? emissionsData : [],
      last30Days: days === 30 ? emissionsData : [],
      last12Months: days === 365 ? emissionsData : [],
    };

    // Store in cache
    this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
    console.log(`Cache stored for ${cacheKey}`);

    return result;
  }

  private async getCarbonApiKeyFromRedis(userId: string): Promise<string | null> {
    try {
      const Redis = require('ioredis');
      const redis = new Redis({
        host: '192.168.160.185',
        port: 6379,
      });

      const settings = await redis.hget('carbon-settings', userId);
      await redis.quit();

      if (settings) {
        const parsed = JSON.parse(settings);
        return parsed.apiKey || null;
      }

      return null;
    } catch (error) {
      console.error('Error reading carbon API key from Redis:', error);
      return null;
    }
  }

  private async fetchCarbonIntensityHistory(zone: string, apiKey: string, days: number): Promise<any[]> {
    const today = moment().startOf('day');
    const startDate = moment().subtract(days, 'days').startOf('day');

    // Limit concurrent requests to avoid overwhelming the API
    const BATCH_SIZE = 10;
    const datePromises = [];
    const dates = [];

    for (let m = moment(startDate); m.isSameOrBefore(today, 'day'); m.add(1, 'day')) {
      dates.push(m.format('YYYY-MM-DD'));
    }

    // Process in batches
    const results = [];
    for (let i = 0; i < dates.length; i += BATCH_SIZE) {
      const batch = dates.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(date =>
        axios.get('https://api.electricitymap.org/v3/carbon-intensity/history', {
          params: { zone, datetime: date },
          headers: { 'auth-token': apiKey },
          timeout: 5000, // Reduced timeout
        })
        .then(response => {
          if (response.data.history && response.data.history.length > 0) {
            return {
              date,
              carbonIntensity: response.data.history[0].carbonIntensity,
            };
          }
          return null;
        })
        .catch(error => {
          console.error(`Error fetching carbon intensity for ${date}:`, error.message);
          return null;
        })
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    return results.filter(item => item !== null);
  }

  private async getEnergyData(userId: string, days: number, timezone: string) {
    const endDate = moment().tz(timezone).endOf('day').toDate();
    const startDate = moment().tz(timezone).subtract(days, 'days').startOf('day').toDate();

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

    const sortedEnergy = [...energyData].sort((a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const results = [];

    for (let i = 1; i < sortedEnergy.length; i++) {
      const current = sortedEnergy[i];
      const previous = sortedEnergy[i - 1];
      const currentDate = moment(current.date).format('YYYY-MM-DD');

      const carbonData = carbonIntensityHistory.find(c => c.date === currentDate);
      if (!carbonData) continue;

      const carbonIntensity = carbonData.carbonIntensity || 0;
      const currentPvPower = parseFloat(current.pvPower || '0');
      const previousPvPower = parseFloat(previous.pvPower || '0');
      const currentGridIn = parseFloat(current.gridIn || '0');
      const previousGridIn = parseFloat(previous.gridIn || '0');

      const dailyPvPower = currentPvPower > previousPvPower ? currentPvPower - previousPvPower : currentPvPower;
      const dailyGridUsed = currentGridIn > previousGridIn ? currentGridIn - previousGridIn : currentGridIn;

      const unavoidableEmissions = (dailyGridUsed * carbonIntensity) / 1000;
      const avoidedEmissions = (dailyPvPower * carbonIntensity) / 1000;
      const totalEnergy = dailyGridUsed + dailyPvPower;
      const selfSufficiencyScore = totalEnergy > 0 ? (dailyPvPower / totalEnergy) * 100 : 0;

      results.push({
        date: currentDate,
        carbonIntensity: Math.round(carbonIntensity * 10) / 10,
        gridEnergy: Math.round(dailyGridUsed * 10) / 10,
        solarEnergy: Math.round(dailyPvPower * 10) / 10,
        unavoidableEmissions: Math.round(unavoidableEmissions * 100) / 100,
        avoidedEmissions: Math.round(avoidedEmissions * 100) / 100,
        selfSufficiencyScore: Math.round(selfSufficiencyScore * 10) / 10,
      });
    }

    return results;
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