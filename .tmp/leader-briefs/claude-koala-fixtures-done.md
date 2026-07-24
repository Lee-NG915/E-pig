# Koala fixtures done

- Claude 起稿了首版脚本与 fixtures；Leader 因单 collection 不足 20 条，改为 `/collections/all` 分桶并重跑。
- Counts（约）: Sofas 29, Living Room 30, Bedroom 26；部分细分类目公开目录本身不足 20。
- 路径: `src/adapters/commerce/mock/fixtures/koala/`
- 刷新: `pnpm catalog:fetch-koala`
