import { IsDefined, IsOptional, IsString, MinLength } from 'class-validator';

export class KitDto {
  @IsString()
  @MinLength(1)
  @IsDefined()
  subject: string;

  @IsString()
  @IsOptional()
  preview?: string;
}
