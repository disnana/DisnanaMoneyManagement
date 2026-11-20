import { getCategoryById } from '../data/categories';
import type { CategoryDef, Transaction } from '../types/finance';

const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase();

export function normalizeTransactionSearch(query: string): string {
  return normalize(query.trim());
}

export function createTransactionSearch(
  customCategories: readonly CategoryDef[] | undefined,
  accountNames: Readonly<Record<string, string>>,
) {
  const categories = new Map<string, string>();
  const accounts = new Map<string, string>();
  const priorResults = new WeakMap<readonly Transaction[], { query: string; rows: readonly Transaction[] }>();

  const normalizedAccount = (id?: string) => {
    if (!id || !accountNames[id]) return '';
    let name = accounts.get(id);
    if (name === undefined) {
      name = normalize(accountNames[id]);
      accounts.set(id, name);
    }
    return name;
  };

  function matches(row: Transaction, query: string) {
    if (normalize(row.title).includes(query)
      || (row.memo && normalize(row.memo).includes(query))
      || (row.counterparty && normalize(row.counterparty).includes(query))
      || (row.accountingSubject && normalize(row.accountingSubject).includes(query))) return true;

    let category = categories.get(row.categoryId);
    if (category === undefined) {
      category = normalize(getCategoryById(row.categoryId, customCategories).name);
      categories.set(row.categoryId, category);
    }
    return category.includes(query) || normalizedAccount(row.accountId).includes(query)
      || normalizedAccount(row.toAccountId).includes(query);
  }

  return (transactions: readonly Transaction[], query: string): readonly Transaction[] => {
    if (!query) return transactions;
    const prior = priorResults.get(transactions);
    if (prior?.query === query) return prior.rows;
    // If the query got narrower, a new match must have matched the previous substring.
    const candidates = prior && query.includes(prior.query) ? prior.rows : transactions;
    const rows = candidates.filter((row) => matches(row, query));
    priorResults.set(transactions, { query, rows });
    return rows;
  };
}
