import { IsDefined, IsOptional, IsString, MinLength } from 'class-validator';
import { JSONSchema } from 'class-validator-jsonschema';

export class GhostDto {
  @IsString()
  @MinLength(2)
  @IsDefined()
  title: string;

  @IsOptional()
  @IsString()
  @JSONSchema({
    description: 'Comma separated list of tag names, for example: news, product',
  })
  tags?: string;
}
