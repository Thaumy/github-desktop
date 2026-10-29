import { describe, it } from 'node:test'
import assert from 'node:assert'
import { SignInStore, SignInResult } from '../../src/lib/stores/sign-in-store'
import { AccountsStore } from '../../src/lib/stores/accounts-store'
import { InMemoryStore, AsyncInMemoryStore } from '../helpers/stores'

function createStore() {
  return new SignInStore(
    new AccountsStore(new InMemoryStore(), new AsyncInMemoryStore())
  )
}

describe('SignInStore', () => {
  it('cancels GitHub.com and Enterprise sign-in without entering authentication', () => {
    const store = createStore()
    const results: SignInResult[] = []
    store.beginDotComSignIn(result => results.push(result))
    store.beginEnterpriseSignIn(result => results.push(result))
    assert.deepEqual(results, [{ kind: 'cancelled' }, { kind: 'cancelled' }])
    assert.equal(store.getState(), null)
  })

  it('does not authenticate through endpoints, browser requests, or OAuth callbacks', async () => {
    const store = createStore()
    let authenticated = false
    const subscription = store.onDidAuthenticate(() => {
      authenticated = true
    })
    await store.setEndpoint('https://example.com')
    await store.authenticateWithBrowser()
    await store.resolveOAuthRequest({
      name: 'oauth',
      code: 'unused',
      state: 'unused',
    })
    assert.equal(authenticated, false)
    assert.equal(store.getState(), null)
    subscription.dispose()
  })
})
