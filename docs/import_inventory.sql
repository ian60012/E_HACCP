BEGIN;

INSERT INTO inv_items (code, name, category, base_unit) VALUES
  ('FLOUR-DUMP-0002', '普通面粉 Plain Flour 12.5kg', '原料', '包'),
  ('HDL-01', '无骨鸡肉块', 'hot_process', 'PCS'),
  ('INGR-DUMP-0001', '白胡椒粉 white pepper powder', '原料', '包'),
  ('INGR-DUMP-0002', '白糖 white sugar', '原料', '包'),
  ('INGR-DUMP-0003', '东古一品鲜 Donggu Yipinxian Soy Sauce', '原料', '箱'),
  ('INGR-DUMP-0005', '家乐鸡精 Knorr Chicken Bouillon', '原料', '箱'),
  ('INGR-DUMP-0006', '家乐鸡汁 Knorr Liquid Seasoning', '原料', '箱'),
  ('INGR-DUMP-0011', '太太乐鸡精 Tai Tai Le Chicken Bouillon', '原料', '箱'),
  ('INGR-DUMP-0012', '味精 monosodium glutamate', '原料', '袋'),
  ('INGR-DUMP-0013', '洋葱粉 onion powder', '原料', '包'),
  ('INGR-DUMP-0014', '猪油 lard', '原料', '罐'),
  ('INGR-DUMP-0015', '大喜大牛肉粉 Dasida Beef Powder', '原料', '箱'),
  ('INGR-DUMP-0016', '芝麻油 sesame oil', '原料', '箱'),
  ('INGR-DUMP-0017', '家乐香港鸡粉 Kotex Hong Kong Chef''s Gold Dressed Chicken Powder', '原料', '箱'),
  ('INGR-DUMP-0018', '黄豆酱 Liubiju Soybean Paste', '原料', '箱'),
  ('INGR-DUMP-0019', '甜面酱 Liubiju Sweet Bean Paste', '原料', '箱'),
  ('INGR-DUMP-0020', '八角 star anise', '原料', '箱'),
  ('INGR-DUMP-0021', '山柰 galangal', '原料', '包'),
  ('INGR-DUMP-0022', '茴香 fennel', '原料', '包'),
  ('INTERNAL-0001', '大米 rice', '原料', 'KG'),
  ('INTERNAL-0002', '盐 salt', '原料', '袋'),
  ('INTERNAL-0003', '粉丝 粉条 vermicelli', '原料', '箱'),
  ('INTERNAL-0004', '老豆腐 old tofu', '原料', 'PCS'),
  ('INTERNAL-0005', '鸡蛋 egg', '原料', '箱'),
  ('MEAT - LW-0009', '生雞爪 Chicken Feet', '原料', 'KG'),
  ('MEAT-DUMP-0001', '豬肉碎 40% Fat Pork Mince 40% Fat', '原料', 'KG'),
  ('MEAT-DUMP-0002', '雞肉碎 Chicken Mince', '原料', 'KG'),
  ('PPC', '猪肉酸菜', 'Frozen Dumpling', '包'),
  ('PS', '豬肉三鮮', 'Frozen', '包'),
  ('SEA-DUMP-0001', '冷冻虾肉 shrimp meat', '原料', '箱'),
  ('VEG-DUMP-0008', '冻姜 frozen ginger', '原料', '箱'),
  ('VEG-DUMP-0018', '包菜碎 Cabbage Diced 5mm', '原料', 'KG')
ON CONFLICT (code) DO NOTHING;

INSERT INTO inv_item_allowed_locations (item_id, location_id)
SELECT i.id, l.id FROM (VALUES
  ('FLOUR-DUMP-0002', 'DRY-01'),
  ('HDL-01', 'FREEZE-01'),
  ('INGR-DUMP-0001', 'DRY-01'),
  ('INGR-DUMP-0002', 'DRY-01'),
  ('INGR-DUMP-0003', 'DRY-01'),
  ('INGR-DUMP-0005', 'DRY-01'),
  ('INGR-DUMP-0006', 'DRY-01'),
  ('INGR-DUMP-0011', 'DRY-01'),
  ('INGR-DUMP-0012', 'DRY-01'),
  ('INGR-DUMP-0013', 'DRY-01'),
  ('INGR-DUMP-0014', 'DRY-01'),
  ('INGR-DUMP-0015', 'DRY-01'),
  ('INGR-DUMP-0016', 'DRY-01'),
  ('INGR-DUMP-0017', 'DRY-01'),
  ('INGR-DUMP-0018', 'DRY-01'),
  ('INGR-DUMP-0019', 'DRY-01'),
  ('INGR-DUMP-0020', 'DRY-01'),
  ('INGR-DUMP-0021', 'DRY-01'),
  ('INGR-DUMP-0022', 'DRY-01'),
  ('INTERNAL-0001', 'DRY-01'),
  ('INTERNAL-0002', 'DRY-01'),
  ('INTERNAL-0003', 'DRY-01'),
  ('INTERNAL-0004', 'COLD-01'),
  ('INTERNAL-0005', 'COLD-01'),
  ('MEAT - LW-0009', 'FREEZE-01'),
  ('MEAT-DUMP-0001', 'COLD-01'),
  ('MEAT-DUMP-0002', 'COLD-01'),
  ('PPC', 'FREEZE-01'),
  ('PS', 'FREEZE-01'),
  ('SEA-DUMP-0001', 'FREEZE-01'),
  ('VEG-DUMP-0008', 'COLD-01'),
  ('VEG-DUMP-0018', 'COLD-01')
) AS pairs(item_code, loc_code)
JOIN inv_items i ON i.code = pairs.item_code
JOIN inv_locations l ON l.code = pairs.loc_code
ON CONFLICT DO NOTHING;

COMMIT;
