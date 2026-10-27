import { IsIn } from 'class-validator';
import {
  PAID_TIERS,
  PaidTier,
} from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';

export class BillingSubscribeDto {
  @IsIn(['MONTHLY', 'YEARLY'])
  period: 'MONTHLY' | 'YEARLY';

  // legacy tiers stay valid here, SubscriptionService.canPurchaseTier decides
  // who can still buy them
  @IsIn([...PAID_TIERS])
  billing: PaidTier;

  utm: string;

  dub: string;

  datafast_session_id: string;
  datafast_visitor_id: string;
}
