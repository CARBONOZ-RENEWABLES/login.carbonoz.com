export interface IPagination {
  page: number;
  size: number;
}

export interface IPage<T = any> {
  items: T[];
  totalItems?: number;
  itemCount?: number;
  itemsPerPage?: number;
  totalPages?: number;
  currentPage?: number;
}
