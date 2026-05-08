"""LabelMaker models."""

from sqlalchemy import Column, Integer, ForeignKey, VARCHAR, Text, Numeric, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class LabelTemplate(Base):
    __tablename__ = "label_templates"
    __table_args__ = (
        UniqueConstraint("prod_product_id", "pack_type_code", name="uq_label_template_product_pack"),
    )

    id = Column(Integer, primary_key=True, index=True)
    prod_product_id = Column(Integer, ForeignKey("prod_products.id", ondelete="CASCADE"), nullable=False)
    pack_type_code = Column(VARCHAR(50), nullable=False)
    product_name_zh = Column(VARCHAR(200), nullable=False, server_default="")
    product_name_en = Column(VARCHAR(200), nullable=False)
    net_weight_g = Column(Numeric(10, 2), nullable=False)
    serving_size_g = Column(Numeric(10, 2), nullable=False)
    servings_per_package = Column(Numeric(8, 2), nullable=False, server_default="1")
    storage_conditions = Column(Text, nullable=False)
    customer_text = Column(Text, nullable=False)
    shelf_life_days = Column(Integer, nullable=False, server_default="365")
    nutrition_per_100g = Column(JSONB, nullable=False)
    ingredients = Column(JSONB, nullable=False)
    recipe = Column(JSONB, nullable=True)
    allergens_confirmed_at = Column(TIMESTAMP(timezone=True), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    product = relationship("ProdProduct", lazy="raise")
