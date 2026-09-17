export interface ActionDecision {
    task: 'triage' | 'review' | null;
    number: number | null;
    reason: string | null;
}
export interface ActionPolicy {
    allowForks: boolean;
    allowExternalIssues: boolean;
}
export declare function booleanInput(value: string | undefined, name: string): boolean;
export declare function decideAction(eventName: string, payload: unknown, repository: string, policy: ActionPolicy): ActionDecision;
