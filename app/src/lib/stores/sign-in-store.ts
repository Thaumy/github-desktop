import { Disposable } from 'event-kit'
import { Account } from '../../models/account'
import { TypedBaseStore } from './base-store'
import { IOAuthAction } from '../parse-app-url'
import { AccountsStore } from './accounts-store'

export enum SignInStep {
  EndpointEntry = 'EndpointEntry',
  ExistingAccountWarning = 'ExistingAccountWarning',
  Authentication = 'Authentication',
  TwoFactorAuthentication = 'TwoFactorAuthentication',
  Success = 'Success',
}

/**
 * The union type of all possible states that the sign in
 * store can be in save the uninitialized state (null).
 */
export type SignInState =
  | IEndpointEntryState
  | IExistingAccountWarning
  | IAuthenticationState
  | ISuccessState

/**
 * Base interface for shared properties between states
 */
export interface ISignInState {
  /**
   * The sign in step represented by this state
   */
  readonly kind: SignInStep

  /**
   * An error which, if present, should be presented to the
   * user in close proximity to the actions or input fields
   * related to the current step.
   */
  readonly error: Error | null

  /**
   * A value indicating whether or not the sign in store is
   * busy processing a request. While this value is true all
   * form inputs and actions save for a cancel action should
   * be disabled and the user should be made aware that the
   * sign in process is ongoing.
   */
  readonly loading: boolean

  readonly resultCallback: (result: SignInResult) => void
}

/**
 * State interface representing the endpoint entry step.
 * This is the initial step in the Enterprise sign in
 * flow and is not present when signing in to GitHub.com
 */
export interface IExistingAccountWarning extends ISignInState {
  readonly kind: SignInStep.ExistingAccountWarning
  /**
   * The URL to the host which we're currently authenticating
   * against. This will be either https://api.github.com when
   * signing in against GitHub.com or a user-specified
   * URL when signing in against a GitHub Enterprise
   * instance.
   */
  readonly existingAccount: Account
  readonly endpoint: string

  readonly resultCallback: (result: SignInResult) => void
}

/**
 * State interface representing the endpoint entry step.
 * This is the initial step in the Enterprise sign in
 * flow and is not present when signing in to GitHub.com
 */
export interface IEndpointEntryState extends ISignInState {
  readonly kind: SignInStep.EndpointEntry
  readonly resultCallback: (result: SignInResult) => void
}

/**
 * State interface representing the Authentication step where
 * the user provides credentials and/or initiates a browser
 * OAuth sign in process. This step occurs as the first step
 * when signing in to GitHub.com and as the second step when
 * signing in to a GitHub Enterprise instance.
 */
export interface IAuthenticationState extends ISignInState {
  readonly kind: SignInStep.Authentication

  /**
   * The URL to the host which we're currently authenticating
   * against. This will be either https://api.github.com when
   * signing in against GitHub.com or a user-specified
   * URL when signing in against a GitHub Enterprise
   * instance.
   */
  readonly endpoint: string

  readonly resultCallback: (result: SignInResult) => void

  readonly oauthState?: {
    state: string
    endpoint: string
    onAuthCompleted: (account: Account) => void
    onAuthError: (error: Error) => void
  }
}

/**
 * Sentinel step representing a successful sign in process. Sign in
 * components may use this as a signal to dismiss the ongoing flow
 * or to show a message to the user indicating that they've been
 * successfully signed in.
 */
export interface ISuccessState {
  readonly kind: SignInStep.Success
  readonly resultCallback: (result: SignInResult) => void
}

export type SignInResult =
  | { kind: 'success'; account: Account }
  | { kind: 'cancelled' }

/** Retains the store interface without browser authentication or OAuth. */
export class SignInStore extends TypedBaseStore<SignInState | null> {
  public constructor(_accountStore: AccountsStore) {
    super()
  }

  public onDidAuthenticate(_fn: (account: Account) => void): Disposable {
    return new Disposable(() => {})
  }

  public getState(): SignInState | null {
    return null
  }

  public reset() {
    this.emitUpdate(null)
  }

  public beginDotComSignIn(resultCallback?: (result: SignInResult) => void) {
    resultCallback?.({ kind: 'cancelled' })
  }

  public beginEnterpriseSignIn(
    resultCallback?: (result: SignInResult) => void
  ) {
    resultCallback?.({ kind: 'cancelled' })
  }

  public async authenticateWithBrowser(): Promise<void> {}

  public async resolveOAuthRequest(_action: IOAuthAction): Promise<void> {}

  public async setEndpoint(_url: string): Promise<void> {}
}
