export type ExtensionButtonAction = 'fill-auto' | 'submit-auto';

export const defaultExtensionButtonAction: ExtensionButtonAction = 'fill-auto';

export function normalizeExtensionButtonAction(action: unknown): ExtensionButtonAction {
    return action === 'submit-auto' ? action : defaultExtensionButtonAction;
}
