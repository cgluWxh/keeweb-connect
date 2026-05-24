import { ConnectionBlock } from './connect/connection-block';
import { FunctionComponent } from 'preact';
import { Shortcuts } from './shortcuts';
import { Footer } from './footer';
import { Usage } from './usage';
import { Passkeys } from './passkeys';
import { ExtensionButtonAction } from './extension-button-action';
import { model } from 'options/settings-model';
import { BackendConnectionState } from 'common/backend-connection-state';

const MainBlock: FunctionComponent = () => {
    return (
        <>
            <ConnectionBlock />
            {model.backendConnectionState === BackendConnectionState.Connected ? <Usage /> : null}
            <ExtensionButtonAction />
            <Passkeys />
            <Shortcuts />
            <Footer />
        </>
    );
};

export { MainBlock };
