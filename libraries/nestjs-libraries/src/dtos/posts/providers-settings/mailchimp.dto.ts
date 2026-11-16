import { IsDefined, IsOptional, IsString, MinLength } from 'class-validator';
import { JSONSchema } from 'class-validator-jsonschema';

export class MailchimpDto {
  @IsString()
  @MinLength(1)
  @IsDefined()
  subject: string;

  @IsString()
  @IsOptional()
  preview?: string;

  @IsString()
  @MinLength(1)
  @IsDefined()
  @JSONSchema({
    description: 'Audience must be an id',
  })
  list: string;
}
