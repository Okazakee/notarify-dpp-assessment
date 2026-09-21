import { HttpStatus, Injectable } from '@nestjs/common'
import { isUUID } from 'class-validator'
import { ApiException } from '../common/api-exception.js'
import { Prisma } from '../generated/prisma/client.js'
import { PrismaService } from '../prisma/prisma.service.js'
import type { CreateProductDto } from './dto/create-product.dto.js'
import type { ListProductsQueryDto } from './dto/list-products-query.dto.js'
import type {
  CertificationInputDto,
  MaterialInputDto,
  SustainabilityInputDto,
} from './dto/nested-product.dto.js'
import type { PatchProductDto } from './dto/patch-product.dto.js'
import type {
  CertificationResponse,
  MaterialResponse,
  ProductDetail,
  ProductListItem,
  ProductListResponse,
  ProductStatus,
  SustainabilityResponse,
} from './product.types.js'

const MATERIAL_ORDER: Prisma.MaterialOrderByWithRelationInput[] = [
  { position: 'asc' },
  { id: 'asc' },
]
const CERTIFICATION_ORDER: Prisma.CertificationOrderByWithRelationInput[] = [{ id: 'asc' }]

const PRODUCT_DETAIL_INCLUDE = {
  category: { select: { id: true, name: true } },
  materials: { orderBy: MATERIAL_ORDER },
  sustainability: true,
  certifications: { orderBy: CERTIFICATION_ORDER },
  passport: { select: { withdrawnAt: true } },
}

type ProductWithDetails = Prisma.ProductGetPayload<{
  include: typeof PRODUCT_DETAIL_INCLUDE
}>

type ProductListRow = {
  id: string
}

type ProductCountRow = {
  count: bigint
}
type MutationTransaction = Prisma.TransactionClient

type ScalarProductFields = Pick<
  CreateProductDto,
  | 'name'
  | 'sku'
  | 'serialNumber'
  | 'categoryId'
  | 'description'
  | 'productionDate'
  | 'originCountry'
>

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async listCategories(): Promise<Array<{ id: string; stableCode: string; name: string }>> {
    return this.prisma.category.findMany({
      orderBy: [{ stableCode: 'asc' }, { id: 'asc' }],
      select: { id: true, stableCode: true, name: true },
    })
  }

  async create(companyId: string, input: CreateProductDto): Promise<ProductDetail> {
    this.ensureCompanyId(companyId)
    this.validateInputDates(input)
    this.validateNestedInput(input)

    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.validateCategory(tx, input.categoryId)
        await this.validateChildIds(tx, input.materials, input.certifications)

        const product = await tx.product.create({
          data: {
            companyId,
            name: input.name ?? null,
            sku: input.sku ?? null,
            serialNumber: input.serialNumber ?? null,
            categoryId: input.categoryId ?? null,
            description: input.description ?? null,
            productionDate: this.parseDateOnly(input.productionDate),
            originCountry: input.originCountry ?? null,
          },
        })

        if (input.materials !== undefined) {
          await this.insertMaterials(tx, product.id, input.materials)
        }
        if (input.sustainability !== undefined && input.sustainability !== null) {
          await tx.sustainability.create({
            data: {
              productId: product.id,
              ...this.sustainabilityCreateData(input.sustainability),
            },
          })
        }
        if (input.certifications !== undefined) {
          await this.insertCertifications(tx, product.id, input.certifications)
        }

        const result = await tx.product.findUnique({
          where: { id: product.id },
          include: PRODUCT_DETAIL_INCLUDE,
        })
        if (!result) {
          throw this.productNotFound()
        }
        return this.mapDetail(result)
      })
    } catch (error) {
      this.handleMutationError(error, input.serialNumber)
    }
  }

  async findOne(companyId: string, id: string): Promise<ProductDetail> {
    this.ensureCompanyId(companyId)
    this.ensureProductId(id)
    const product = await this.prisma.product.findFirst({
      where: { id, companyId, deletedAt: null },
      include: PRODUCT_DETAIL_INCLUDE,
    })
    if (!product) {
      throw this.productNotFound()
    }
    return this.mapDetail(product)
  }

  async update(companyId: string, id: string, input: PatchProductDto): Promise<ProductDetail> {
    this.ensureCompanyId(companyId)
    this.ensureProductId(id)
    if (!Number.isInteger(input.expectedDraftRevision) || input.expectedDraftRevision < 0) {
      throw this.validationError('expectedDraftRevision must be a non-negative integer.')
    }
    this.validateInputDates(input)
    this.validateNestedInput(input)

    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.validateCategory(tx, input.categoryId)
        await this.validateChildIds(tx, input.materials, input.certifications, id)

        const claimed = await tx.$queryRaw<Array<{ draftRevision: number }>>(Prisma.sql`
          UPDATE "Product"
          SET "draftRevision" = "draftRevision" + 1,
              "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${id}::uuid
            AND "companyId" = ${companyId}::uuid
            AND "deletedAt" IS NULL
            AND "draftRevision" = ${input.expectedDraftRevision}
          RETURNING "draftRevision"
        `)

        if (claimed.length === 0) {
          const current = await tx.product.findFirst({
            where: { id, companyId },
            select: { deletedAt: true },
          })
          if (!current || current.deletedAt !== null) {
            throw this.productNotFound()
          }
          throw this.revisionConflict()
        }

        const scalarData = this.scalarUpdateData(input)
        if (Object.keys(scalarData).length > 0) {
          await tx.product.update({ where: { id }, data: scalarData })
        }
        if (input.materials !== undefined) {
          await this.replaceMaterials(tx, id, input.materials)
        }
        if (input.sustainability !== undefined) {
          if (input.sustainability === null) {
            await tx.sustainability.deleteMany({ where: { productId: id } })
          } else {
            await tx.sustainability.upsert({
              where: { productId: id },
              create: {
                productId: id,
                ...this.sustainabilityCreateData(input.sustainability),
              },
              update: this.sustainabilityUpdateData(input.sustainability),
            })
          }
        }
        if (input.certifications !== undefined) {
          await this.replaceCertifications(tx, id, input.certifications)
        }

        const result = await tx.product.findUnique({
          where: { id },
          include: PRODUCT_DETAIL_INCLUDE,
        })
        if (!result) {
          throw this.productNotFound()
        }
        return this.mapDetail(result)
      })
    } catch (error) {
      this.handleMutationError(error, input.serialNumber)
    }
  }

  async list(companyId: string, query: ListProductsQueryDto): Promise<ProductListResponse> {
    this.ensureCompanyId(companyId)
    const from = this.parseDateOnly(query.productionFrom)
    const to = this.parseDateOnly(query.productionTo)
    if (from && to && from > to) {
      throw this.validationError('productionFrom must not be after productionTo.')
    }

    const conditions: Prisma.Sql[] = [
      Prisma.sql`p."companyId" = ${companyId}::uuid`,
      Prisma.sql`p."deletedAt" IS NULL`,
    ]
    if (query.categoryId !== undefined) {
      conditions.push(Prisma.sql`p."categoryId" = ${query.categoryId}::uuid`)
    }
    if (query.originCountry !== undefined) {
      conditions.push(Prisma.sql`p."originCountry" = ${query.originCountry}`)
    }
    if (from) {
      conditions.push(Prisma.sql`p."productionDate" >= ${this.dateSqlValue(from)}::date`)
    }
    if (to) {
      conditions.push(Prisma.sql`p."productionDate" <= ${this.dateSqlValue(to)}::date`)
    }
    if (query.q !== undefined && query.q.trim().length > 0) {
      const text = query.q.trim()
      const prefix = `${text}%`
      conditions.push(Prisma.sql`(
        to_tsvector('simple', coalesce(p."name", '') || ' ' || coalesce(p."description", ''))
          @@ plainto_tsquery('simple', ${text})
        OR p."sku" = ${text}
        OR p."serialNumber" = ${text}
        OR p."sku" ILIKE ${prefix}
        OR p."serialNumber" ILIKE ${prefix}
      )`)
    }
    if (query.status === 'PUBLISHED') {
      conditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM "Passport" AS passport
        WHERE passport."productId" = p."id" AND passport."withdrawnAt" IS NULL
      )`)
    } else if (query.status === 'DRAFT') {
      conditions.push(Prisma.sql`NOT EXISTS (
        SELECT 1 FROM "Passport" AS passport
        WHERE passport."productId" = p."id" AND passport."withdrawnAt" IS NULL
      )`)
    }

    const where = Prisma.join(conditions, ' AND ')
    const offset = (query.page - 1) * query.pageSize
    const [countRows, idRows] = await this.prisma.$transaction([
      this.prisma.$queryRaw<ProductCountRow[]>(Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM "Product" AS p
        WHERE ${where}
      `),
      this.prisma.$queryRaw<ProductListRow[]>(Prisma.sql`
        SELECT p."id"
        FROM "Product" AS p
        WHERE ${where}
        ORDER BY p."createdAt" DESC, p."id" DESC
        LIMIT ${query.pageSize}
        OFFSET ${offset}
      `),
    ])

    const ids = idRows.map((row) => row.id)
    const products = ids.length
      ? await this.prisma.product.findMany({
          where: { id: { in: ids }, companyId, deletedAt: null },
          include: PRODUCT_DETAIL_INCLUDE,
        })
      : []
    const byId = new Map(products.map((product) => [product.id, product]))
    const items = ids.flatMap((productId) => {
      const product = byId.get(productId)
      return product ? [this.mapListItem(product)] : []
    })
    const total = Number(countRows[0]?.count ?? 0n)
    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
    }
  }

  private async validateCategory(
    tx: MutationTransaction,
    categoryId: string | null | undefined,
  ): Promise<void> {
    if (categoryId === undefined || categoryId === null) {
      return
    }
    const category = await tx.category.findUnique({
      where: { id: categoryId },
      select: { id: true },
    })
    if (!category) {
      throw this.validationError('categoryId does not identify an existing category.')
    }
  }

  private async validateChildIds(
    tx: MutationTransaction,
    materials: MaterialInputDto[] | undefined,
    certifications: CertificationInputDto[] | undefined,
    productId?: string,
  ): Promise<void> {
    const materialIds = this.uniqueChildIds(
      materials?.map((item) => item.id),
      'material',
    )
    if (materialIds.length > 0) {
      const existing = await tx.material.findMany({
        where: { id: { in: materialIds } },
        select: { id: true, productId: true },
      })
      for (const child of existing) {
        if (productId === undefined || child.productId !== productId) {
          throw this.validationError('A material id may only be reused within its current product.')
        }
      }
    }

    const certificationIds = this.uniqueChildIds(
      certifications?.map((item) => item.id),
      'certification',
    )
    if (certificationIds.length > 0) {
      const existing = await tx.certification.findMany({
        where: { id: { in: certificationIds } },
        select: { id: true, productId: true },
      })
      for (const child of existing) {
        if (productId === undefined || child.productId !== productId) {
          throw this.validationError(
            'A certification id may only be reused within its current product.',
          )
        }
      }
    }
  }

  private uniqueChildIds(ids: Array<string | undefined> | undefined, kind: string): string[] {
    if (!ids) {
      return []
    }
    const seen = new Set<string>()
    const unique: string[] = []
    for (const id of ids) {
      if (id === undefined) {
        continue
      }
      if (seen.has(id)) {
        throw this.validationError(`${kind} ids must be unique within a replacement collection.`)
      }
      seen.add(id)
      unique.push(id)
    }
    return unique
  }

  private validateInputDates(
    input: ScalarProductFields & {
      certifications?: CertificationInputDto[]
    },
  ): void {
    this.parseDateOnly(input.productionDate)
    for (const certification of input.certifications ?? []) {
      const issueDate = this.parseDateOnly(certification.issueDate)
      const expirationDate = this.parseDateOnly(certification.expirationDate)
      if (issueDate && expirationDate && expirationDate < issueDate) {
        throw this.validationError('expirationDate must not be before issueDate.')
      }
    }
  }

  private validateNestedInput(input: {
    materials?: MaterialInputDto[] | null
    certifications?: CertificationInputDto[] | null
    sustainability?: SustainabilityInputDto | null
  }): void {
    if (Object.hasOwn(input, 'materials') && input.materials === null) {
      throw this.validationError('materials must be an array when supplied.')
    }
    if (Object.hasOwn(input, 'certifications') && input.certifications === null) {
      throw this.validationError('certifications must be an array when supplied.')
    }
    if (
      input.sustainability !== undefined &&
      input.sustainability !== null &&
      (typeof input.sustainability !== 'object' || Array.isArray(input.sustainability))
    ) {
      throw this.validationError('sustainability must be an object or null.')
    }
    if (input.materials !== undefined && input.materials !== null) {
      const positions = new Set<number>()
      for (const [index, material] of input.materials.entries()) {
        if (!material || typeof material !== 'object') {
          throw this.validationError('materials must contain objects.')
        }
        if ((material.id as unknown) === null) {
          throw this.validationError('material id must be a UUID when supplied.')
        }
        if ((material.position as unknown) === null) {
          throw this.validationError(
            'material position must be a non-negative integer when supplied.',
          )
        }
        const position = material.position ?? index
        if (positions.has(position)) {
          throw this.validationError('Material positions must be unique within a product.')
        }
        positions.add(position)
      }
    }
    if (input.certifications !== undefined && input.certifications !== null) {
      for (const certification of input.certifications) {
        if (!certification || typeof certification !== 'object') {
          throw this.validationError('certifications must contain objects.')
        }
        if ((certification.id as unknown) === null) {
          throw this.validationError('certification id must be a UUID when supplied.')
        }
      }
    }
  }

  private scalarUpdateData(input: PatchProductDto): Prisma.ProductUncheckedUpdateInput {
    const data: Prisma.ProductUncheckedUpdateInput = {}
    if (input.name !== undefined) data.name = input.name ?? null
    if (input.sku !== undefined) data.sku = input.sku ?? null
    if (input.serialNumber !== undefined) data.serialNumber = input.serialNumber ?? null
    if (input.categoryId !== undefined) data.categoryId = input.categoryId ?? null
    if (input.description !== undefined) data.description = input.description ?? null
    if (input.productionDate !== undefined)
      data.productionDate = this.parseDateOnly(input.productionDate)
    if (input.originCountry !== undefined) data.originCountry = input.originCountry ?? null
    return data
  }

  private sustainabilityCreateData(input: SustainabilityInputDto): {
    carbonKgCo2e: number | null
    waterLitres: number | null
    recycledPercent: number | null
    repairabilityScore: number | null
    recyclable: boolean | null
  } {
    return {
      carbonKgCo2e: input.carbonKgCo2e ?? null,
      waterLitres: input.waterLitres ?? null,
      recycledPercent: input.recycledPercent ?? null,
      repairabilityScore: input.repairabilityScore ?? null,
      recyclable: input.recyclable ?? null,
    }
  }

  private sustainabilityUpdateData(
    input: SustainabilityInputDto,
  ): Prisma.SustainabilityUpdateManyMutationInput {
    const data: Prisma.SustainabilityUpdateManyMutationInput = {}
    if (input.carbonKgCo2e !== undefined) data.carbonKgCo2e = input.carbonKgCo2e ?? null
    if (input.waterLitres !== undefined) data.waterLitres = input.waterLitres ?? null
    if (input.recycledPercent !== undefined) data.recycledPercent = input.recycledPercent ?? null
    if (input.repairabilityScore !== undefined)
      data.repairabilityScore = input.repairabilityScore ?? null
    if (input.recyclable !== undefined) data.recyclable = input.recyclable ?? null
    return data
  }

  private async insertMaterials(
    tx: MutationTransaction,
    productId: string,
    materials: MaterialInputDto[],
  ): Promise<void> {
    await tx.material.createMany({
      data: materials.map((material, index) => ({
        ...(material.id === undefined ? {} : { id: material.id }),
        productId,
        name: material.name,
        percentage: material.percentage,
        originCountry: material.originCountry ?? null,
        recyclable: material.recyclable ?? null,
        position: material.position ?? index,
      })),
    })
  }

  private async replaceMaterials(
    tx: MutationTransaction,
    productId: string,
    materials: MaterialInputDto[],
  ): Promise<void> {
    await tx.material.deleteMany({ where: { productId } })
    await this.insertMaterials(tx, productId, materials)
  }

  private async insertCertifications(
    tx: MutationTransaction,
    productId: string,
    certifications: CertificationInputDto[],
  ): Promise<void> {
    await tx.certification.createMany({
      data: certifications.map((certification) => ({
        ...(certification.id === undefined ? {} : { id: certification.id }),
        productId,
        name: certification.name ?? null,
        issuingAuthority: certification.issuingAuthority ?? null,
        issueDate: this.parseDateOnly(certification.issueDate),
        expirationDate: this.parseDateOnly(certification.expirationDate),
      })),
    })
  }

  private async replaceCertifications(
    tx: MutationTransaction,
    productId: string,
    certifications: CertificationInputDto[],
  ): Promise<void> {
    await tx.certification.deleteMany({ where: { productId } })
    await this.insertCertifications(tx, productId, certifications)
  }

  private mapDetail(product: ProductWithDetails): ProductDetail {
    return {
      ...this.mapListItem(product),
      description: product.description,
      productionDate: this.serializeDate(product.productionDate),
      originCountry: product.originCountry,
      materials: product.materials.map(
        (material): MaterialResponse => ({
          id: material.id,
          name: material.name,
          percentage: this.decimalToNumber(material.percentage) ?? 0,
          originCountry: material.originCountry,
          recyclable: material.recyclable,
          position: material.position,
        }),
      ),
      sustainability: product.sustainability
        ? ({
            carbonKgCo2e: this.decimalToNumber(product.sustainability.carbonKgCo2e),
            waterLitres: this.decimalToNumber(product.sustainability.waterLitres),
            recycledPercent: this.decimalToNumber(product.sustainability.recycledPercent),
            repairabilityScore: this.decimalToNumber(product.sustainability.repairabilityScore),
            recyclable: product.sustainability.recyclable,
          } satisfies SustainabilityResponse)
        : null,
      certifications: product.certifications.map(
        (certification): CertificationResponse => ({
          id: certification.id,
          name: certification.name,
          issuingAuthority: certification.issuingAuthority,
          issueDate: this.serializeDate(certification.issueDate),
          expirationDate: this.serializeDate(certification.expirationDate),
        }),
      ),
    }
  }

  private mapListItem(product: ProductWithDetails): ProductListItem {
    const status: ProductStatus =
      product.passport !== null && product.passport.withdrawnAt === null ? 'PUBLISHED' : 'DRAFT'
    return {
      id: product.id,
      name: product.name,
      sku: product.sku,
      serialNumber: product.serialNumber,
      categoryId: product.categoryId,
      categoryName: product.category?.name ?? null,
      status,
      draftRevision: product.draftRevision,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    }
  }

  private parseDateOnly(value: string | null | undefined): Date | null {
    if (value === undefined || value === null) {
      return null
    }
    const [yearText, monthText, dayText] = value.split('-')
    const year = Number(yearText)
    const month = Number(monthText)
    const day = Number(dayText)
    const date = new Date(Date.UTC(year, month - 1, day))
    if (
      !Number.isInteger(year) ||
      !Number.isInteger(month) ||
      !Number.isInteger(day) ||
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      throw this.validationError('Dates must be valid calendar dates in YYYY-MM-DD format.')
    }
    return date
  }

  private dateSqlValue(value: Date): string {
    return value.toISOString().slice(0, 10)
  }

  private serializeDate(value: Date | null): string | null {
    return value === null ? null : value.toISOString().slice(0, 10)
  }

  private decimalToNumber(value: unknown): number | null {
    if (value === null || value === undefined) {
      return null
    }
    if (typeof value === 'object' && value !== null && 'toNumber' in value) {
      const toNumber = value.toNumber
      if (typeof toNumber === 'function') {
        return toNumber.call(value)
      }
    }
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  private ensureCompanyId(companyId: string): void {
    if (!isUUID(companyId)) {
      throw this.validationError('The authenticated actor has an invalid company id.')
    }
  }

  private ensureProductId(id: string): void {
    if (!isUUID(id)) {
      throw this.validationError('Product id must be a UUID.')
    }
  }

  private handleMutationError(error: unknown, serialNumber: string | null | undefined): never {
    if (error instanceof ApiException) {
      throw error
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002' && serialNumber !== undefined && serialNumber !== null) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          'PRODUCT_SERIAL_CONFLICT',
          'Product serial number already exists.',
        )
      }
      if (
        error.code === 'P2002' ||
        error.code === 'P2003' ||
        error.code === 'P2004' ||
        error.code === 'P2011'
      ) {
        throw this.validationError('The product request violates a data constraint.')
      }
    }
    throw new ApiException(
      HttpStatus.INTERNAL_SERVER_ERROR,
      'INTERNAL_SERVER_ERROR',
      'Internal server error.',
    )
  }

  private productNotFound(): ApiException {
    return new ApiException(HttpStatus.NOT_FOUND, 'PRODUCT_NOT_FOUND', 'Product not found.')
  }

  private revisionConflict(): ApiException {
    return new ApiException(
      HttpStatus.CONFLICT,
      'PRODUCT_REVISION_CONFLICT',
      'Product draft revision conflict.',
    )
  }

  private validationError(message = 'Invalid product request.'): ApiException {
    return new ApiException(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', message)
  }
}
