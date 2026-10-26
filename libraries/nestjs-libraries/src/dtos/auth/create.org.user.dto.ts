import {
  Equals,
  IsDefined,
  IsEmail,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Provider } from '@prisma/client';

export class CreateOrgUserDto {
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  @IsDefined()
  @ValidateIf((o) => !o.providerToken)
  password: string;

  @IsString()
  @IsDefined()
  provider: Provider;

  @IsString()
  @IsDefined()
  @ValidateIf((o) => !o.password)
  providerToken: string;

  @IsEmail()
  @IsDefined()
  @ValidateIf((o) => !o.providerToken)
  email: string;

  @IsString()
  @IsDefined()
  @MinLength(3)
  @MaxLength(128)
  company: string;

  // Only the email/password form has the checkbox, social sign ups show a
  // notice next to their buttons instead
  @ValidateIf((o) => o.provider === 'LOCAL')
  @Equals(true, {
    message: 'Please agree to the Terms of Service and Privacy Policy',
  })
  acceptTerms?: boolean;

  datafast_visitor_id: string;
}
