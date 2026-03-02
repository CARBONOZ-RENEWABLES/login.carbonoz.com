import { getSchemaPath } from '@nestjs/swagger';
import { IPage } from '../interfaces/pagination-interface';

type PrismaFindManyArgs = {
  where?: any;
  select?: any;
  include?: any;
  orderBy?: any;
  skip?: number;
  take?: number;
};

export async function paginate<
  TModel,
  TFindManyArgs extends PrismaFindManyArgs = PrismaFindManyArgs,
>(
  model: any,
  args: TFindManyArgs,
  page = 0,
  size = 10,
): Promise<IPage<TModel>> {
  const countArgs = {
    where: args.where,
    orderBy: args.orderBy,
  };

  const [items, totalItems] = await Promise.all([
    model.findMany({
      ...args,
      take: size,
      skip: size * page,
    }) as Promise<TModel[]>,
    model.count(countArgs),
  ]);

  return {
    items,
    totalItems,
    itemCount: items.length,
    itemsPerPage: size,
    totalPages: Math.ceil(totalItems / size),
    currentPage: page,
  };
}

export const getPaginatedSchema = (model: string | any): any => {
  return {
    schema: {
      allOf: [
        {
          properties: {
            message: { type: 'string' },
            payload: {
              properties: {
                items: {
                  type: 'array',
                  items: model
                    ? { $ref: getSchemaPath(model) }
                    : { type: 'object' },
                },
                totalItems: { type: 'number' },
                itemCount: { type: 'number' },
                itemsPerPage: { type: 'number' },
                totalPages: { type: 'number' },
                currentPage: { type: 'number' },
              },
            },
          },
        },
      ],
    },
  };
};
