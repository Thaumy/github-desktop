import { IDataStore, ISecureStore } from './stores'
import { Account } from '../../models/account'
import { TypedBaseStore } from './base-store'

/** Compatibility boundary for the account-free application.
 * Saved accounts and keychain tokens are never loaded or used.
 */
export class AccountsStore extends TypedBaseStore<ReadonlyArray<Account>> {
  public constructor(_dataStore: IDataStore, _secureStore: ISecureStore) {
    super()
  }

  public async getAll(): Promise<ReadonlyArray<Account>> {
    return []
  }

  public async addAccount(_account: Account): Promise<Account | null> {
    return null
  }

  public async refresh(): Promise<void> {
    this.emitUpdate([])
  }

  public async removeAccount(_account: Account): Promise<void> {
    this.emitUpdate([])
  }
}
