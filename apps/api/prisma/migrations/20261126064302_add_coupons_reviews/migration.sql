-- CreateEnum
CREATE TYPE "coupon_type" AS ENUM ('PERCENTAGE', 'FIXED');

-- CreateEnum
CREATE TYPE "review_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "coupon_id" UUID;

-- CreateTable
CREATE TABLE "coupons" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "type" "coupon_type" NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "minimum_order_amount" DECIMAL(12,2),
    "maximum_discount" DECIMAL(12,2),
    "usage_limit" INTEGER,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "starts_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "title" VARCHAR(150),
    "comment" TEXT,
    "status" "review_status" NOT NULL DEFAULT 'PENDING',
    "is_verified_purchase" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");

-- CreateIndex
CREATE INDEX "coupons_active_validity_idx" ON "coupons"("is_active", "starts_at", "expires_at");

-- CreateIndex
CREATE INDEX "reviews_product_status_idx" ON "reviews"("product_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_user_product_key" ON "reviews"("user_id", "product_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Review rating must be between 1 and 5
ALTER TABLE "reviews"
ADD CONSTRAINT "reviews_rating_range"
CHECK ("rating" BETWEEN 1 AND 5);

-- Coupon discount must be positive
ALTER TABLE "coupons"
ADD CONSTRAINT "coupons_value_positive"
CHECK ("value" > 0);

-- Percentage discounts cannot exceed 100%
ALTER TABLE "coupons"
ADD CONSTRAINT "coupons_percentage_max"
CHECK ("type" <> 'PERCENTAGE' OR "value" <= 100);

-- Monetary coupon limits cannot be negative
ALTER TABLE "coupons"
ADD CONSTRAINT "coupons_minimum_order_non_negative"
CHECK ("minimum_order_amount" IS NULL OR "minimum_order_amount" >= 0);

ALTER TABLE "coupons"
ADD CONSTRAINT "coupons_maximum_discount_non_negative"
CHECK ("maximum_discount" IS NULL OR "maximum_discount" >= 0);

-- Usage counters must be valid
ALTER TABLE "coupons"
ADD CONSTRAINT "coupons_usage_count_non_negative"
CHECK ("usage_count" >= 0);

ALTER TABLE "coupons"
ADD CONSTRAINT "coupons_usage_limit_positive"
CHECK ("usage_limit" IS NULL OR "usage_limit" > 0);

-- Expiry must be after start
ALTER TABLE "coupons"
ADD CONSTRAINT "coupons_valid_date_range"
CHECK (
  "starts_at" IS NULL
  OR "expires_at" IS NULL
  OR "expires_at" > "starts_at"
);