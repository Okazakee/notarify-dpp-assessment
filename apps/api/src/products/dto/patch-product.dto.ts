import { IsInt, Min } from 'class-validator'
import { CreateProductDto } from './create-product.dto.js'

export class PatchProductDto extends CreateProductDto {
  @IsInt()
  @Min(0)
  expectedDraftRevision!: number
}
