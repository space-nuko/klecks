import './polyfills/polyfills';
import { KlApp } from './app/kl-app';
import { IKlProject } from './klecks/kl-types';
import { SaveReminder } from './klecks/ui/components/save-reminder';
import { klHistory } from './klecks/history/kl-history';
import { klPsdToKlProject, readPsd } from './klecks/storage/psd';
import { LANG } from './language/language';
import { loadAgPsd } from './klecks/storage/load-ag-psd';

export interface IEmbedParams {
    project?: IKlProject;
    psdBlob?: Blob;
    onSubmit: (onSuccess: () => void, onError: () => void) => void;
    embedUrl?: string;
    logoImg?: any;
    bottomBar?: HTMLElement;
    aboutEl?: HTMLElement;
    targetEl?: HTMLElement;
}

export interface IReadPSD {
    blob: Blob;
    callback: (k: IKlProject | null) => void;
}

export class Embed {
    isInitialized: boolean = false;
    klApp: KlApp | null = null;
    psdQueue: IReadPSD[] = []; // queue of psds waiting while ag-psd is loading
    agPsd: any | 'error';

    loadingScreenEl: HTMLElement | null;
    loadingScreenTextEl: HTMLElement | null;

    p: IEmbedParams;

    constructor(p: IEmbedParams) {
        this.p = p;
        this.loadingScreenEl = document.getElementById('klecks-loading-screen');
        this.loadingScreenTextEl = document.getElementById('klecks-loading-screen-text');

        if (this.loadingScreenTextEl) {
            this.loadingScreenTextEl.textContent = LANG('embed-init-waiting');
        }

        if (p.project) {
            this.openProject(p.project);
        }
    }

    openProject(project: IKlProject) {
        try {
            if (this.isInitialized) {
                throw new Error('Already called openProject');
            }
            this.isInitialized = true;

            const saveReminder = new SaveReminder(
                klHistory,
                false,
                false,
                () => { },
                () => this.klApp ? this.klApp.isDrawing() : false,
                null,
                null,
            );
            this.klApp = new KlApp(
                project,
                {
                    saveReminder,
                    bottomBar: this.p.bottomBar,
                    aboutEl: this.p.aboutEl,
                    embed: {
                        url: this.p.embedUrl,
                        onSubmit: this.p.onSubmit,
                    },
                    targetEl: this.p.targetEl
                }
            );
            saveReminder.init();

            if (this.loadingScreenEl && this.loadingScreenEl.parentNode) {
                this.loadingScreenEl.parentNode.removeChild(this.loadingScreenEl);
            }
            this.loadingScreenEl = null;
            this.loadingScreenTextEl = null;

            const target = this.p.targetEl || document.body;
            target.append(this.klApp.getEl());
        } catch (e) {
            if (this.loadingScreenTextEl) {
                this.loadingScreenTextEl.textContent = '❌ ' + e;
            }
            if (this.loadingScreenEl) {
                this.loadingScreenEl.className += 'loading-screen-error';
            }
            console.error(e);
        }
    }

    initError(error: string) {
        if (this.loadingScreenTextEl) {
            this.loadingScreenTextEl.textContent = '❌ ' + error;
        }
        if (this.loadingScreenEl) {
            this.loadingScreenEl.className += 'loading-screen-error';
        }
    };

    getPNG(): Blob {
        if (!this.klApp) {
            throw new Error('App not initialized');
        }
        return this.klApp.getPNG();
    }

    async getPSD(): Promise<Blob> {
        if (!this.klApp) {
            throw new Error('App not initialized');
        }
        return await this.klApp.getPSD();
    }

    async readPSDs(psds: IReadPSD[]) {
        if (psds.length === 0) {
            return;
        }

        const readItem = (item: IReadPSD) => {
            try {
                const psd = this.agPsd.readPsd(item.blob);
                const project = klPsdToKlProject(readPsd(psd));
                item.callback(project);
            } catch (e) {
                console.error('failed to read psd', e);
                item.callback(null);
            }
        };

        if (!this.agPsd) {
            if (this.psdQueue.length === 0) {
                // load ag-psd
                try {
                    this.agPsd = await loadAgPsd();
                } catch (e) {
                    this.agPsd = 'error';
                }
                while (this.psdQueue.length) {
                    readItem(this.psdQueue.shift() as IReadPSD);
                }
            }
            psds.forEach(item => {
                this.psdQueue.push(item);
            });
        } else {
            psds.forEach(readItem);
        }
    }
}
