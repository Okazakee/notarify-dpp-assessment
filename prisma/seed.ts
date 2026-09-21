import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../apps/api/src/generated/prisma/client.ts'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required')
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
const categories = [
  { stableCode: 'DEMO-ELECTRONICS', name: 'Demo Electronics' },
  { stableCode: 'DEMO-FURNITURE', name: 'Demo Furniture' },
  { stableCode: 'DEMO-TEXTILES', name: 'Demo Textiles' },
]

try {
  for (const category of categories) {
    await prisma.category.upsert({
      where: { stableCode: category.stableCode },
      update: { name: category.name },
      create: category,
    })
  }
  console.info(`Seeded ${categories.length} categories.`)
} finally {
  await prisma.$disconnect()
}
