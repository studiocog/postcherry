import { IsDefined, IsString, MaxLength, MinLength } from 'class-validator';

export class VimeoDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  @IsDefined()
  title: string;
}
