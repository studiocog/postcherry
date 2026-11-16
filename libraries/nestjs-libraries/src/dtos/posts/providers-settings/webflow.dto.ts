import { IsDefined, IsString, MinLength } from 'class-validator';
import { JSONSchema } from 'class-validator-jsonschema';

export class WebflowDto {
  @IsString()
  @MinLength(1)
  @IsDefined()
  @JSONSchema({
    description: 'Collection must be an id',
  })
  collection: string;

  @IsString()
  @MinLength(2)
  @IsDefined()
  title: string;
}
