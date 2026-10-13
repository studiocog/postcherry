import { IsEnum } from 'class-validator';
import { AccountType } from '@prisma/client';

export class AccountTypeDto {
  @IsEnum(AccountType)
  accountType: AccountType;
}
