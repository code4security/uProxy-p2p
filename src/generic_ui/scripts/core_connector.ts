/**
 * core_connector.ts
 *
 * Handles all connection and communication with the uProxy core.
 */

import * as uproxy_core_api from '../../interfaces/uproxy_core_api';
import * as browser_connector from '../../interfaces/browser_connector';
import * as social from '../../interfaces/social';
import * as net from '../../lib/net/net.types';

interface FullfillAndReject {
  fulfill :Function;
  reject :Function;
};

/**
 * This class hides all cross backend-ui communication wiring so that the
 * uProxy UI may speak through this connector as if talking directly to Core.
 *
 * Propagates these messages:
 *    Core --[ UPDATES  ]--> UI
 *    UI   --[ COMMANDS ]--> Core
 */
export default class CoreConnector implements uproxy_core_api.CoreApi {

  // Global unique promise ID.
  private promiseId_ :number = 1;
  private mapPromiseIdToFulfillAndReject_ :{[id :number] : FullfillAndReject} =
      {};

  constructor(private browserConnector_ :browser_connector.CoreBrowserConnector) {
    this.browserConnector_.onUpdate(uproxy_core_api.Update.COMMAND_FULFILLED,
                                    this.handleRequestFulfilled_);
    this.browserConnector_.onUpdate(uproxy_core_api.Update.COMMAND_REJECTED,
                                    this.handleRequestRejected_);

    this.connect();
  }

  public on = (name :string, callback :Function) => {
    this.browserConnector_.on(name, callback);
  }

  public connect = () :Promise<void> => {
    return this.browserConnector_.connect();
  }

  public connected = () => {
    return this.browserConnector_.status.connected;
  }

  public onUpdate = (update :uproxy_core_api.Update, handler :Function) => {
    this.browserConnector_.onUpdate(update, handler);
  }

  /**
   * Send a Command from the UI to the Core, as a result of some user
   * interaction.
   */
  public sendCommand = (command :uproxy_core_api.Command, data ?:any) => {
    var payload :browser_connector.Payload = {
      cmd: 'emit',
      type: command,
      data: data,
      promiseId: 0
    }
    console.log('UI sending Command ' + //uproxy_core_api.Command[command],
        JSON.stringify(payload));
    this.browserConnector_.send(payload);
  }

  /**
   * Send a Command from the UI to the Core, as a result of some user
   * interaction.  Command returns a promise that fulfills/rejects upon
   * an ack/reject from the backend.
   */
  public promiseCommand = (command :uproxy_core_api.Command, data ?:any)
      : Promise<any> => {
    var promiseId :number = ++(this.promiseId_);
    var payload :browser_connector.Payload = {
      cmd: 'emit',
      type: command,
      data: data,
      promiseId: promiseId
    }
    console.log('UI sending Promise Command ' + uproxy_core_api.Command[command],
        JSON.stringify(payload));

    // Create a new promise and store its fulfill and reject functions.
    var fulfillFunc :Function;
    var rejectFunc :Function;
    var promise :Promise<any> = new Promise<any>((F, R) => {
      fulfillFunc = F;
      rejectFunc = R;
    });
    // TODO: we may want to periodically remove garbage from this table
    // e.g. if the app restarts, all promises should be removed or reject.
    // Also we may want to reject promises after some timeout.
    this.mapPromiseIdToFulfillAndReject_[promiseId] = {
      fulfill: fulfillFunc,
      reject: rejectFunc
    };

    // Send request to backend.
    this.browserConnector_.send(payload);

    return promise;
  }

  private handleRequestFulfilled_ = (data :any) => {
    var promiseId = data.promiseId;
    console.log('promise command fulfilled ' + promiseId);
    if (this.mapPromiseIdToFulfillAndReject_[promiseId]) {
      this.mapPromiseIdToFulfillAndReject_[promiseId]
          .fulfill(data.argsForCallback);
      delete this.mapPromiseIdToFulfillAndReject_[promiseId];
    } else {
      console.warn('fulfill not found ' + promiseId);
    }
  }

  private handleRequestRejected_ = (data :any) => {
    var promiseId = data.promiseId;
    console.log('promise command rejected ' + promiseId);
    if (this.mapPromiseIdToFulfillAndReject_[promiseId]) {
      this.mapPromiseIdToFulfillAndReject_[promiseId]
          .reject(data.errorForCallback);
      delete this.mapPromiseIdToFulfillAndReject_[promiseId];
    } else {
      console.warn('reject not found ' + promiseId);
    }
  }

  // --- CoreApi interface requirements (sending COMMANDS) ---

  public getFullState = () :Promise<uproxy_core_api.InitialState> => {
    return this.promiseCommand(uproxy_core_api.Command.GET_FULL_STATE);
  }

  // TODO: Reconnect this hook, which while we're testing, sends a new instance
  // message anytime we click on the user in the UI.
  sendInstance = (clientId :string) => {
    this.sendCommand(uproxy_core_api.Command.SEND_INSTANCE_HANDSHAKE_MESSAGE, clientId);
  }

  modifyConsent = (command:uproxy_core_api.ConsentCommand) => {
    console.log('Modifying consent.', command);
    this.sendCommand(uproxy_core_api.Command.MODIFY_CONSENT, command);
  }

  start = (path :social.InstancePath) : Promise<net.Endpoint> => {
    console.log('Starting to proxy through ' + path);
    return this.promiseCommand(uproxy_core_api.Command.START_PROXYING, path);
  }

  stop = (path :social.InstancePath) => {
    console.log('Stopping proxy session.');
    return this.promiseCommand(uproxy_core_api.Command.STOP_PROXYING, path);
  }

  updateGlobalSettings = (newSettings :uproxy_core_api.GlobalSettings) => {
    console.log('Updating global settings to ' + JSON.stringify(newSettings));
    this.sendCommand(uproxy_core_api.Command.UPDATE_GLOBAL_SETTINGS,
                     newSettings);
  }

  updateGlobalSetting = (change: uproxy_core_api.UpdateGlobalSettingArgs) => {
    this.sendCommand(uproxy_core_api.Command.UPDATE_GLOBAL_SETTING, change);
  }

  login = (loginArgs :uproxy_core_api.LoginArgs) : Promise<uproxy_core_api.LoginResult> => {
    return this.promiseCommand(uproxy_core_api.Command.LOGIN, loginArgs);
  }

  logout = (networkInfo :social.SocialNetworkInfo) : Promise<void> => {
    return this.promiseCommand(uproxy_core_api.Command.LOGOUT, networkInfo);
  }

  inviteGitHubUser = (data :uproxy_core_api.CreateInviteArgs): Promise<void> => {
    return this.promiseCommand(uproxy_core_api.Command.INVITE_GITHUB_USER, data);
  }

  getInviteUrl = (data :uproxy_core_api.CreateInviteArgs): Promise<string> => {
    return this.promiseCommand(uproxy_core_api.Command.GET_INVITE_URL, data);
  }

  sendEmail = (emailData :uproxy_core_api.EmailData): void => {
    this.sendCommand(uproxy_core_api.Command.SEND_EMAIL, emailData);
  }

  restart = () => {
    this.browserConnector_.restart();
  }

  getLogs = () : Promise<string> => {
    return this.promiseCommand(uproxy_core_api.Command.GET_LOGS);
  }

  getNatType = () : Promise<string> => {
    return this.promiseCommand(uproxy_core_api.Command.GET_NAT_TYPE);
  }

  getPortControlSupport = (): Promise<uproxy_core_api.PortControlSupport> => {
    return this.promiseCommand(uproxy_core_api.Command.GET_PORT_CONTROL_SUPPORT);
  }

  checkReproxy = (port :number): Promise<uproxy_core_api.ReproxyCheck> => {
    return this.promiseCommand(uproxy_core_api.Command.CHECK_REPROXY, port);
  }

  pingUntilOnline = (pingUrl :string) : Promise<void> => {
    return this.promiseCommand(
        uproxy_core_api.Command.PING_UNTIL_ONLINE, pingUrl);
  }

  getVersion = () :Promise<{ version :string }> => {
    return this.promiseCommand(uproxy_core_api.Command.GET_VERSION);
  }

  acceptInvitation = (data :uproxy_core_api.AcceptInvitationData) : Promise<void>=> {
    return this.promiseCommand(uproxy_core_api.Command.ACCEPT_INVITATION, data);
  }

  cloudUpdate = (args :uproxy_core_api.CloudOperationArgs) :Promise<uproxy_core_api.CloudOperationArgs> => {
    return this.promiseCommand(uproxy_core_api.Command.CLOUD_UPDATE, args);
  }

  removeContact = (args:uproxy_core_api.RemoveContactArgs): Promise<void> => {
    return this.promiseCommand(uproxy_core_api.Command.REMOVE_CONTACT, args);
  }

  postReport = (args:uproxy_core_api.PostReportArgs) : Promise<void> => {
    return this.promiseCommand(uproxy_core_api.Command.POST_REPORT, args);
  }

  verifyUser = (inst :social.InstancePath) :Promise<void> => {
    return this.promiseCommand(uproxy_core_api.Command.VERIFY_USER, inst );
  }

  finishVerifyUser = (args: uproxy_core_api.FinishVerifyArgs)
      :Promise<void> => {
    return this.promiseCommand(uproxy_core_api.Command.VERIFY_USER_SAS, args);
  }
}  // class CoreConnector

