import { IsDefined, IsString, MinLength } from 'class-validator';
import { JSONSchema } from 'class-validator-jsonschema';

export class CircleDto {
  @IsString()
  @MinLength(1)
  @IsDefined()
  title: string;

  @IsString()
  @MinLength(1)
  @IsDefined()
  @JSONSchema({
    description: 'Space must be an id from the spaces list',
  })
  space: string;
}
