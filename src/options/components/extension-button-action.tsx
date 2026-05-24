import { FunctionComponent } from 'preact';
import { ExtensionButtonAction as ExtensionButtonActionValue } from 'common/extension-button-action';
import { res } from 'options/utils';
import { model } from 'options/settings-model';

const ExtensionButtonAction: FunctionComponent = () => {
    const setExtensionButtonAction = (event: Event) => {
        model.setExtensionButtonAction(
            (event.currentTarget as HTMLInputElement).value as ExtensionButtonActionValue
        );
    };

    return (
        <>
            <h2 id="extension-button-action">{res('optionsExtensionButtonAction')}</h2>
            <p>{res('optionsExtensionButtonActionDescription')}</p>
            <p>
                <label>
                    <input
                        type="radio"
                        name="extension-button-action"
                        value="fill-auto"
                        checked={model.extensionButtonAction === 'fill-auto'}
                        onChange={setExtensionButtonAction}
                    />{' '}
                    {res('optionsExtensionButtonActionFillAuto')}
                </label>
            </p>
            <p>
                <label>
                    <input
                        type="radio"
                        name="extension-button-action"
                        value="submit-auto"
                        checked={model.extensionButtonAction === 'submit-auto'}
                        onChange={setExtensionButtonAction}
                    />{' '}
                    {res('optionsExtensionButtonActionSubmitAuto')}
                </label>
            </p>
        </>
    );
};

export { ExtensionButtonAction };
