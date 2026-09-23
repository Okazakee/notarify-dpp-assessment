import { IsInt, Min } from 'class-validator'

/**
 * Publish request body.
 *
 * `expectedDraftRevision` is the revision the caller believes it is publishing. It is a
 * precondition, never a client-settable value: a publish whose revision does not match
 * the stored draft is rejected rather than publishing content the caller never saw.
 */
export class PublishProductDto {
  @IsInt()
  @Min(0)
  expectedDraftRevision!: number
}
