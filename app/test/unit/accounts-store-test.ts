import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Account } from '../../src/models/account'
import { AccountsStore } from '../../src/lib/stores/accounts-store'
import { IDataStore, ISecureStore } from '../../src/lib/stores/stores'

// Any access to persisted accounts or tokens must fail this test.
const unexpectedAccess = () => {
  throw new Error('Account storage must not be accessed')
}
const dataStore: IDataStore = {
  getItem: unexpectedAccess,
  setItem: unexpectedAccess,
}
const secureStore: ISecureStore = {
  getItem: unexpectedAccess,
  setItem: unexpectedAccess,
  deleteItem: unexpectedAccess,
}

describe('AccountsStore', () => {
  it('does not load persisted accounts or their tokens', async () => {
    const store = new AccountsStore(dataStore, secureStore)
    assert.deepEqual(await store.getAll(), [])
    await store.refresh()
    assert.deepEqual(await store.getAll(), [])
  })

  it('does not accept new accounts or write credentials', async () => {
    const store = new AccountsStore(dataStore, secureStore)
    const account = new Account('joan', '', '', [], '', 1, '', 'free')
    assert.equal(await store.addAccount(account), null)
    await store.removeAccount(account)
    assert.deepEqual(await store.getAll(), [])
  })
})
