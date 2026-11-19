import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

// Set a password (accounts made with Google or single sign-on) or change it.
// The current password is needed only when the account already has one.
export class SetPasswordDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  currentPassword?: string;

  @IsString()
  @MinLength(8, { message: 'Use at least 8 characters' })
  @MaxLength(64)
  password: string;
}
