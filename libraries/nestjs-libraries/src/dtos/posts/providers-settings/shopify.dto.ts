import { IsDefined, IsString, MinLength } from 'class-validator';
import { JSONSchema } from 'class-validator-jsonschema';

export class ShopifyDto {
  @IsString()
  @MinLength(2)
  @IsDefined()
  title: string;

  @IsString()
  @MinLength(1)
  @IsDefined()
  @JSONSchema({
    description: 'Blog must be an id',
  })
  blog: string;
}
