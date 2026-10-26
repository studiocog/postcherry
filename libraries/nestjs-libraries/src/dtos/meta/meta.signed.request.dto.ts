import { IsOptional } from 'class-validator';

// Body Meta posts (form encoded) to the deauthorize and data deletion
// callbacks. Only optional and not type checked on purpose: these callbacks
// must always answer 200, the service validates the value itself.
export class MetaSignedRequestDto {
  @IsOptional()
  signed_request?: string;
}
