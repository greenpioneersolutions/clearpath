export type InstallStage = 'idle' | 'checking-node' | 'node-needed' | 'installing-node' | 'installing-cli' | 'verifying' | 'success' | 'error';
export type InstallErrorCode = 'EACCES' | 'NETWORK' | 'NODE_MISSING' | 'UNKNOWN';
export interface InstallError {
    code: InstallErrorCode;
    message: string;
    /** Friendly, non-technical hint to show the user (what to try next). */
    hint: string;
}
export type InstallTarget = 'copilot' | 'claude' | 'node';
export interface NodeCheckResult {
    installed: boolean;
    version?: string;
    /** True if installed version is >= 22 (required by the CLIs). */
    satisfies22: boolean;
    /** Platform — controls which managed install method is available. */
    platform: 'darwin' | 'win32' | 'linux' | 'other';
}
export interface InstallOutputEvent {
    target: InstallTarget;
    line: string;
}
export interface InstallCompleteEvent {
    target: InstallTarget;
    success: boolean;
    error?: InstallError;
}
export interface NodeCheckEvent {
    result: NodeCheckResult;
}
export interface LoginBrowserOpenedEvent {
    cli: 'copilot' | 'claude';
    url: string;
}
