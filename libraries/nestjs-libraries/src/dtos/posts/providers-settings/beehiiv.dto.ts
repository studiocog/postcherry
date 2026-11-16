import { IsDefined, IsOptional, IsString, MinLength } from 'class-validator';

export class BeehiivDto {
  @IsString()
  @MinLength(1)
  @IsDefined()
  title: string;

  @IsString()
  @IsOptional()
  subtitle?: string;
}
