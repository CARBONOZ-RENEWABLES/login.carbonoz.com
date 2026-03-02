import { Controller, Post, Get, Body, Param, UseGuards, HttpCode } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtGuard } from 'src/auth/guard/jwt.guard';
import { RolesGuard } from 'src/auth/guard/roles.guard';
import { AllowRoles, GetUser } from 'src/auth/decorators';
import { ERole, User } from '@prisma/client';
import { SubscriptionService } from './subscription.service';
import { CreateOrderDto, PayPalWebhookDto } from './dto';

@Controller('billing')
@ApiTags('billing')
export class SubscriptionController {
  constructor(private subscriptionService: SubscriptionService) {}

  @Post('create-stripe-payment')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create Stripe payment for subscription' })
  async createStripePayment(@GetUser() user: User, @Body() dto: { planId: string; billingCycle: string; paymentMethodId: string }) {
    return this.subscriptionService.createStripePayment(user.id, dto.planId, dto.billingCycle as 'MONTHLY' | 'YEARLY', dto.paymentMethodId);
  }

  @Post('create-order')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create PayPal order for subscription' })
  async createOrder(@GetUser() user: User, @Body() dto: CreateOrderDto) {
    return this.subscriptionService.createPayPalOrder(user.id, dto.planId, dto.billingCycle);
  }

  @Post('webhook/paypal')
  @HttpCode(200)
  @ApiOperation({ summary: 'PayPal webhook handler' })
  async paypalWebhook(@Body() dto: PayPalWebhookDto) {
    return this.subscriptionService.handlePayPalWebhook(dto);
  }

  @Get('me/subscription')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user subscription' })
  async getMySubscription(@GetUser() user: User) {
    return this.subscriptionService.getUserSubscription(user.id);
  }

  @Get('plans')
  @ApiOperation({ summary: 'Get all active subscription plans' })
  async getPlans() {
    return this.subscriptionService.getActivePlans();
  }

  @Get('admin/plans/all')
  @ApiOperation({ summary: 'Get all subscription plans (including inactive)' })
  async getAllPlans() {
    return this.subscriptionService.getAllPlans();
  }

  @Post('admin/plans')
  @UseGuards(JwtGuard, RolesGuard)
  @AllowRoles(ERole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: Create subscription plan' })
  async createPlan(@Body() dto: { name: string; description?: string; features: string[]; priceMonthly: number; priceYearly?: number; currency?: string }) {
    return this.subscriptionService.createPlan(dto);
  }

  @Post('admin/plans/:planId/public')
  @ApiOperation({ summary: 'Public: Update subscription plan (temporary)' })
  async updatePlanPublic(@Param('planId') planId: string, @Body() dto: { name?: string; description?: string; features?: string[]; priceMonthly?: number; priceYearly?: number; active?: boolean }) {
    return this.subscriptionService.updatePlan(planId, dto);
  }

  @Post('admin/plans/:planId')
  @UseGuards(JwtGuard, RolesGuard)
  @AllowRoles(ERole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: Update subscription plan' })
  async updatePlan(@Param('planId') planId: string, @Body() dto: { name?: string; description?: string; features?: string[]; priceMonthly?: number; priceYearly?: number; active?: boolean }) {
    return this.subscriptionService.updatePlan(planId, dto);
  }

  @Post('admin/subscription/manual-activate/:userId')
  @UseGuards(JwtGuard, RolesGuard)
  @AllowRoles(ERole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: Manually activate user access' })
  async manualActivate(@Param('userId') userId: string) {
    return this.subscriptionService.manualActivate(userId);
  }

  @Post('admin/subscription/manual-deactivate/:userId')
  @UseGuards(JwtGuard, RolesGuard)
  @AllowRoles(ERole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: Manually deactivate user access' })
  async manualDeactivate(@Param('userId') userId: string) {
    return this.subscriptionService.manualDeactivate(userId);
  }
}
