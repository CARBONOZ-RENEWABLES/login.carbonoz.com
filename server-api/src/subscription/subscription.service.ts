import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as paypal from '@paypal/checkout-server-sdk';
import Stripe from 'stripe';

@Injectable()
export class SubscriptionService {
  private paypalClient: paypal.core.PayPalHttpClient;
  private stripe: Stripe;

  constructor(private prisma: PrismaService) {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      throw new Error('PayPal credentials not configured. Please set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env');
    }
    
    const environment = process.env.PAYPAL_MODE === 'live'
      ? new paypal.core.LiveEnvironment(clientId, clientSecret)
      : new paypal.core.SandboxEnvironment(clientId, clientSecret);
    
    this.paypalClient = new paypal.core.PayPalHttpClient(environment);

    // Initialize Stripe
    if (process.env.STRIPE_SECRET_KEY) {
      this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
        apiVersion: '2026-02-25.clover',
      });
    }
  }

  async createStripePayment(userId: string, planId: string, billingCycle: 'MONTHLY' | 'YEARLY', paymentMethodId: string) {
    if (!this.stripe) {
      throw new BadRequestException('Stripe not configured');
    }

    try {
      const plan = await this.prisma.subscriptionPlan.findUnique({ where: { id: planId } });
      if (!plan || !plan.active) {
        throw new BadRequestException('Invalid subscription plan');
      }

      const amount = billingCycle === 'MONTHLY' ? plan.priceMonthly : plan.priceYearly;
      if (!amount) {
        throw new BadRequestException('Selected billing cycle not available');
      }

      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency: plan.currency.toLowerCase(),
        payment_method: paymentMethodId,
        confirm: true,
        metadata: { userId, planId, billingCycle },
        return_url: `${process.env.FRONTED_URL}/ds`,
      });

      if (paymentIntent.status === 'succeeded') {
        const durationMonths = billingCycle === 'MONTHLY' ? 1 : 12;
        const startDate = new Date();
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + durationMonths);

        const payment = await this.prisma.payment.create({
          data: {
            userId,
            amount,
            currency: plan.currency,
            provider: 'STRIPE',
            providerRefId: paymentIntent.id,
            status: 'SUCCESS',
          },
        });

        const subscription = await this.prisma.subscription.create({
          data: {
            userId,
            planId,
            status: 'ACTIVE',
            startDate,
            endDate,
            autoRenew: true,
          },
        });

        await this.prisma.payment.update({
          where: { id: payment.id },
          data: { subscriptionId: subscription.id },
        });

        return { success: true, subscriptionId: subscription.id };
      }

      throw new BadRequestException('Payment failed');
    } catch (error) {
      console.error('Stripe Payment Error:', error);
      throw new BadRequestException(`Payment failed: ${error.message}`);
    }
  }

  async createPayPalOrder(userId: string, planId: string, billingCycle: 'MONTHLY' | 'YEARLY') {
    try {
      const plan = await this.prisma.subscriptionPlan.findUnique({ where: { id: planId } });
      if (!plan || !plan.active) {
        throw new BadRequestException('Invalid subscription plan');
      }

      const amount = billingCycle === 'MONTHLY' ? plan.priceMonthly : plan.priceYearly;
      if (!amount) {
        throw new BadRequestException('Selected billing cycle not available');
      }

      const request = new paypal.orders.OrdersCreateRequest();
      request.prefer('return=representation');
      request.requestBody({
        intent: 'CAPTURE',
        purchase_units: [{
          amount: {
            currency_code: plan.currency,
            value: amount.toFixed(2),
          },
          description: `${plan.name} - ${billingCycle}`,
          custom_id: JSON.stringify({ userId, planId, billingCycle }),
        }],
      });

      const order = await this.paypalClient.execute(request);
      return { orderId: order.result.id, approvalUrl: order.result.links.find(l => l.rel === 'approve')?.href };
    } catch (error) {
      console.error('PayPal Order Creation Error:', error);
      throw new BadRequestException(`Failed to create PayPal order: ${error.message}`);
    }
  }

  async handlePayPalWebhook(event: any) {
    if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
      const capture = event.resource;
      const customId = capture.purchase_units[0].custom_id;
      const { userId, planId, billingCycle } = JSON.parse(customId);

      // Check for duplicate payment
      const existingPayment = await this.prisma.payment.findUnique({
        where: { providerRefId: capture.id },
      });

      if (existingPayment) {
        return { message: 'Payment already processed' };
      }

      const plan = await this.prisma.subscriptionPlan.findUnique({ where: { id: planId } });
      const amount = billingCycle === 'MONTHLY' ? plan.priceMonthly : plan.priceYearly;
      const durationMonths = billingCycle === 'MONTHLY' ? 1 : 12;

      // Create payment record
      const payment = await this.prisma.payment.create({
        data: {
          userId,
          amount,
          currency: plan.currency,
          provider: 'PAYPAL',
          providerRefId: capture.id,
          status: 'SUCCESS',
        },
      });

      // Create or extend subscription
      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + durationMonths);

      const subscription = await this.prisma.subscription.create({
        data: {
          userId,
          planId,
          status: 'ACTIVE',
          startDate,
          endDate,
          autoRenew: true,
        },
      });

      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { subscriptionId: subscription.id },
      });

      return { message: 'Subscription activated', subscriptionId: subscription.id };
    }

    return { message: 'Event processed' };
  }

  async getUserSubscription(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const subscription = await this.prisma.subscription.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { plan: true },
    });

    const now = new Date();
    const hasManualAccess = user?.manualAccessOverride && 
                           (!user?.manualAccessExpiry || user.manualAccessExpiry > now);
    const hasActiveSubscription = subscription?.status === 'ACTIVE' && subscription?.endDate > now;
    const hasAccess = hasManualAccess || hasActiveSubscription;

    return { subscription, hasAccess, manualAccessExpiry: user?.manualAccessExpiry };
  }

  async getActivePlans() {
    const plans = await this.prisma.subscriptionPlan.findMany({
      where: { active: true },
      orderBy: { priceMonthly: 'asc' },
    });

    return { data: plans };
  }

  async getAllPlans() {
    const plans = await this.prisma.subscriptionPlan.findMany({
      orderBy: { priceMonthly: 'asc' },
    });

    return { data: plans };
  }

  async createPlan(dto: { name: string; description?: string; features: string[]; priceMonthly: number; priceYearly?: number; currency?: string }) {
    const plan = await this.prisma.subscriptionPlan.create({
      data: {
        name: dto.name,
        description: dto.description,
        features: dto.features || [],
        priceMonthly: dto.priceMonthly,
        priceYearly: dto.priceYearly,
        currency: dto.currency || 'USD',
        active: true,
      },
    });

    return { success: true, plan };
  }

  async updatePlan(planId: string, dto: { name?: string; description?: string; features?: string[]; priceMonthly?: number; priceYearly?: number; active?: boolean }) {
    const updateData: any = {};
    
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.features !== undefined) updateData.features = dto.features;
    if (dto.priceMonthly !== undefined) updateData.priceMonthly = dto.priceMonthly;
    if (dto.priceYearly !== undefined) updateData.priceYearly = dto.priceYearly;
    if (dto.active !== undefined) updateData.active = dto.active;
    
    const plan = await this.prisma.subscriptionPlan.update({
      where: { id: planId },
      data: updateData,
    });

    return { success: true, plan };
  }

  async manualActivate(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { manualAccessOverride: true },
    });

    return { message: 'Manual access granted' };
  }

  async manualDeactivate(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { manualAccessOverride: false },
    });

    return { message: 'Manual access revoked' };
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async expireSubscriptions() {
    const now = new Date();
    
    // Expire paid subscriptions
    const expiredSubscriptions = await this.prisma.subscription.updateMany({
      where: {
        status: 'ACTIVE',
        endDate: { lt: now },
      },
      data: { status: 'EXPIRED' },
    });

    // Expire manual access overrides
    const expiredManualAccess = await this.prisma.user.updateMany({
      where: {
        manualAccessOverride: true,
        manualAccessExpiry: { lt: now },
      },
      data: { 
        manualAccessOverride: false,
        manualAccessExpiry: null
      },
    });

    console.log(`Expired ${expiredSubscriptions.count} subscriptions and ${expiredManualAccess.count} manual access grants`);
  }
}
