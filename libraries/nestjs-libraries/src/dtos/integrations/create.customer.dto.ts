import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCustomerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  // the first brand of a workspace can take all the channels it already has
  @IsOptional()
  @IsBoolean()
  assignAllChannels?: boolean;
}
