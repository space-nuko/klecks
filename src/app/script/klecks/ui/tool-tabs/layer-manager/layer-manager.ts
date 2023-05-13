import {BB} from '../../../../bb/bb';
import {klHistory} from '../../../history/kl-history';
import {Select} from '../../components/select';
import {PointSlider} from '../../components/point-slider';
import {KlCanvas, MAX_LAYERS} from '../../../canvas/kl-canvas';
import {TMixMode, TUiLayout} from '../../../kl-types';
import {LANG} from '../../../../language/language';
import {translateBlending} from '../../../canvas/translate-blending';
import {PointerListener} from '../../../../bb/input/pointer-listener';
import {IPointerEvent} from '../../../../bb/input/event.types';
import {renameLayerDialog} from './rename-layer-dialog';
import {mergeLayerDialog} from './merge-layer-dialog';
import addLayerImg from '../../../../../img/ui/add-layer.svg';
import duplicateLayerImg from '../../../../../img/ui/duplicate-layer.svg';
import mergeLayerImg from '../../../../../img/ui/merge-layers.svg';
import removeLayerImg from '../../../../../img/ui/remove-layer.svg';
import renameLayerImg from '../../../../../img/ui/rename-layer.svg';
import {theme} from '../../../../theme/theme';

type TLayerEl = HTMLElement & {
    label: HTMLElement;
    opacityLabel: HTMLElement;
    thumb: HTMLCanvasElement;

    spot: number;
    posY: number;
    layerName: string;
    opacity: number;
    pointerListener: PointerListener;
    opacitySlider: PointSlider;
    isSelected: boolean;
};

export class LayerManager {

    private readonly parentEl: HTMLElement;
    private readonly rootEl: HTMLElement;
    private readonly klCanvas: KlCanvas;
    private klCanvasLayerArr: {
        context: CanvasRenderingContext2D;
        opacity: number;
        name: string;
        mixModeStr: TMixMode;
    }[];
    private readonly layerListEl: HTMLElement;
    private layerElArr: TLayerEl[];
    private selectedSpotIndex: number;
    private readonly removeBtn: HTMLButtonElement;
    private readonly addBtn: HTMLButtonElement;
    private readonly duplicateBtn: HTMLButtonElement;
    private readonly mergeBtn: HTMLButtonElement;
    private readonly modeSelect: Select;
    private uiState: TUiLayout;
    private readonly largeThumbDiv: HTMLElement;
    private oldHistoryState: number | undefined;

    private readonly largeThumbCanvas: HTMLCanvasElement;
    private largeThumbInDocument: boolean;
    private largeThumbInTimeout: undefined | ReturnType<typeof setTimeout>;
    private largeThumbTimeout: undefined | ReturnType<typeof setTimeout>;
    private lastpos: number = 0;

    private readonly onSelect: (layerIndex: number) => void;
    private readonly layerHeight: number = 35;
    private readonly layerSpacing: number = 0;

    private move (oldSpotIndex: number, newSpotIndex: number): void {
        if (isNaN(oldSpotIndex) || isNaN(newSpotIndex)) {
            throw 'layermanager - invalid move';
        }
        for (let i = 0; i < this.klCanvasLayerArr.length; i++) {
            ((i) => {
                let posy = this.layerElArr[i].spot; // <- here
                if (this.layerElArr[i].spot === oldSpotIndex) {
                    posy = newSpotIndex;
                } else {
                    if (this.layerElArr[i].spot > oldSpotIndex) {
                        posy--;
                    }
                    if (posy >= newSpotIndex) {
                        posy++;
                    }
                }
                this.layerElArr[i].spot = posy;
                this.layerElArr[i].posY = (this.layerHeight + this.layerSpacing) * (this.klCanvasLayerArr.length - posy - 1);
                this.layerElArr[i].style.top = this.layerElArr[i].posY + 'px';
            })(i);
        }
        if (oldSpotIndex === newSpotIndex) {
            return;
        }
        this.klCanvas.moveLayer(this.selectedSpotIndex, newSpotIndex - oldSpotIndex);
        this.klCanvasLayerArr = this.klCanvas.getLayers();
        this.selectedSpotIndex = newSpotIndex;
        this.mergeBtn.disabled = this.selectedSpotIndex === 0;
    }

    private posToSpot (p: number): number {
        let result = parseInt('' + (p / (this.layerHeight + this.layerSpacing) + 0.5));
        result = Math.min(this.klCanvasLayerArr.length - 1, Math.max(0, result));
        result = this.klCanvasLayerArr.length - result - 1;
        return result;
    }

    /**
     * update css position of all layers that are not being dragged, while dragging
     */
    private updateLayersVerticalPosition (id: number, newspot: number): void {
        newspot = Math.min(this.klCanvasLayerArr.length - 1, Math.max(0, newspot));
        if (newspot === this.lastpos) {
            return;
        }
        for (let i = 0; i < this.klCanvasLayerArr.length; i++) {
            if (this.layerElArr[i].spot === id) { // <- here
                continue;
            }
            let posy = this.layerElArr[i].spot;
            if (this.layerElArr[i].spot > id) {
                posy--;
            }
            if (posy >= newspot) {
                posy++;
            }
            this.layerElArr[i].posY = (this.layerHeight + this.layerSpacing) * (this.klCanvasLayerArr.length - posy - 1);
            this.layerElArr[i].style.top = this.layerElArr[i].posY + 'px';
        }
        this.lastpos = newspot;
    }

    private renameLayer (layerSpot: number): void {

        renameLayerDialog(
            this.parentEl,
            this.klCanvas.getLayer(layerSpot).name,
            (newName) => {
                if (newName === undefined || newName === this.klCanvas.getLayer(layerSpot).name) {
                    return;
                }
                this.klCanvas.renameLayer(layerSpot, newName);
                this.createLayerList();
                klHistory.pause(true);
                this.onSelect(layerSpot);
                klHistory.pause(false);
            }
        );
    }

    private updateHeight (): void {
        this.layerListEl.style.height = (this.layerElArr.length * 35) + 'px';
    }

    private createLayerList (): void {
        this.oldHistoryState = klHistory.getState();
        const createLayerEntry = (index: number): void => {
            const layerName = this.klCanvas.getLayer(index).name;
            const opacity = this.klCanvasLayerArr[index].opacity;
            const layercanvas = this.klCanvasLayerArr[index].context.canvas;

            const layer: TLayerEl = BB.el() as TLayerEl;
            layer.className = 'kl-layer';
            this.layerElArr[index] = layer;
            layer.posY = ((this.klCanvasLayerArr.length - 1) * 35 - index * 35);
            BB.css(layer, {
                top: layer.posY + 'px',
            });
            const innerLayer = BB.el();
            BB.css(innerLayer, {
                position: 'relative',
            });

            const container1 = BB.el();
            BB.css(container1, {
                width: '250px',
                height: '34px',
            });
            const container2 = BB.el();
            layer.append(innerLayer);
            innerLayer.append(container1, container2);

            layer.spot = index;

            //thumb
            {
                const thumbDimensions = BB.fitInto(layercanvas.width, layercanvas.height, 30, 30, 1);
                const thumb = layer.thumb = BB.canvas(thumbDimensions.width, thumbDimensions.height);

                const thc = BB.ctx(thumb);
                thc.save();
                if (thumb.width > layercanvas.width) {
                    thc.imageSmoothingEnabled = false;
                }
                thc.drawImage(layercanvas, 0, 0, thumb.width, thumb.height);
                thc.restore();
                BB.css(layer.thumb, {
                    position: 'absolute',
                    left: ((32 - layer.thumb.width) / 2) + 'px',
                    top: ((32 - layer.thumb.height) / 2) + 'px',
                });
                BB.createCheckerDataUrl(4, (url) => {
                    thumb.style.backgroundImage = 'url(' + url + ')';
                }, theme.isDark());
            }

            //layerlabel
            {
                layer.label = BB.el({
                    className: 'kl-layer__label',
                });
                layer.layerName = layerName;
                layer.label.append(layer.layerName);

                BB.css(layer.label, {
                    position: 'absolute',
                    left: (1 + 32 + 5) + 'px',
                    top: 1 + 'px',
                    fontSize: '13px',
                    width: '170px',
                    height: '20px',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                });

                layer.label.ondblclick = () => {
                    this.renameLayer(layer.spot);
                };
            }
            //layerlabel
            {
                layer.opacityLabel = BB.el({
                    className: 'kl-layer__opacity-label',
                });
                layer.opacity = opacity;
                layer.opacityLabel.append(parseInt('' + (layer.opacity * 100)) + '%');

                BB.css(layer.opacityLabel, {
                    position: 'absolute',
                    left: (250 - 1 - 5 - 50) + 'px',
                    top: 1 + 'px',
                    fontSize: '13px',
                    textAlign: 'right',
                    width: '50px',
                    transition: 'color 0.2s ease-in-out',
                });
            }

            let oldOpacity: number;
            const opacitySlider = new PointSlider({
                init: layer.opacity,
                width: 204,
                pointSize: 14,
                callback: (sliderValue, isFirst, isLast) => {
                    if (isFirst) {
                        oldOpacity = this.klCanvas.getLayer(layer.spot).opacity;
                        klHistory.pause(true);
                        return;
                    }
                    if (isLast) {
                        klHistory.pause(false);
                        if (oldOpacity !== sliderValue) {
                            this.klCanvas.layerOpacity(layer.spot, sliderValue);
                        }
                        return;
                    }
                    layer.opacityLabel.innerHTML = Math.round(sliderValue * 100) + '%';
                    this.klCanvas.layerOpacity(layer.spot, sliderValue);
                },
            });
            BB.css(opacitySlider.getEl(), {
                position: 'absolute',
                left: '39px',
                top: '17px',
            });
            layer.opacitySlider = opacitySlider;

            //larger layer preview - hover
            layer.thumb.onpointerover = (e) => {
                if (e.buttons !== 0 && (!e.pointerType || e.pointerType !== 'touch')) { //shouldn't show while dragging
                    return;
                }

                const thumbDimensions = BB.fitInto(layercanvas.width, layercanvas.height, 250, 250, 1);

                if (this.largeThumbCanvas.width !== thumbDimensions.width || this.largeThumbCanvas.height !== thumbDimensions.height) {
                    this.largeThumbCanvas.width = thumbDimensions.width;
                    this.largeThumbCanvas.height = thumbDimensions.height;
                }
                const ctx = BB.ctx(this.largeThumbCanvas);
                ctx.save();
                if (this.largeThumbCanvas.width > layercanvas.width) {
                    ctx.imageSmoothingEnabled = false;
                }
                ctx.imageSmoothingQuality = 'high';
                ctx.clearRect(0, 0, this.largeThumbCanvas.width, this.largeThumbCanvas.height);
                ctx.drawImage(layercanvas, 0, 0, this.largeThumbCanvas.width, this.largeThumbCanvas.height);
                ctx.restore();
                BB.css(this.largeThumbDiv, {
                    top: (e.clientY - this.largeThumbCanvas.height / 2) + 'px',
                    opacity: '0',
                });
                if (!this.largeThumbInDocument) {
                    document.body.append(this.largeThumbDiv);
                    this.largeThumbInDocument = true;
                }
                clearTimeout(this.largeThumbInTimeout);
                this.largeThumbInTimeout = setTimeout(() => {
                    BB.css(this.largeThumbDiv, {
                        opacity: '1',
                    });
                }, 20);
                clearTimeout(this.largeThumbTimeout);
            };
            layer.thumb.onpointerout = () => {
                clearTimeout(this.largeThumbInTimeout);
                BB.css(this.largeThumbDiv, {
                    opacity: '0',
                });
                clearTimeout(this.largeThumbTimeout);
                this.largeThumbTimeout = setTimeout(() => {
                    if (!this.largeThumbInDocument) {
                        return;
                    }
                    document.body.removeChild(this.largeThumbDiv);
                    this.largeThumbInDocument = false;
                }, 300);
            };

            container1.append(layer.thumb, layer.label, layer.opacityLabel, opacitySlider.getEl());
            let dragstart = false;
            let freshSelection = false;

            //events for moving layers up and down
            const dragEventHandler = (event: IPointerEvent) => {
                if (event.type === 'pointerdown' && event.button === 'left') {
                    BB.css(layer, {
                        transition: 'box-shadow 0.3s ease-in-out',
                    });
                    layer.style.zIndex = '1';
                    this.lastpos = layer.spot;
                    freshSelection = false;
                    if (!layer.isSelected) {
                        freshSelection = true;
                        this.activateLayer(layer.spot);
                    }
                    dragstart = true;

                } else if (event.type === 'pointermove' && event.button === 'left') {

                    if (dragstart) {
                        dragstart = false;
                        BB.css(layer, {
                            boxShadow: '1px 3px 5px rgba(0,0,0,0.4)',
                        });
                    }
                    layer.posY += event.dY;
                    const corrected = Math.max(0, Math.min((this.klCanvasLayerArr.length - 1) * (35), layer.posY));
                    layer.style.top = corrected + 'px';
                    this.updateLayersVerticalPosition(layer.spot, this.posToSpot(layer.posY));

                }
                if (event.type === 'pointerup') {
                    BB.css(layer, {
                        transition: 'all 0.1s linear',
                    });
                    setTimeout(() => {
                        BB.css(layer, {
                            boxShadow: '',
                        });
                    }, 20);
                    layer.posY = Math.max(0, Math.min((this.klCanvasLayerArr.length - 1) * (35), layer.posY));
                    layer.style.zIndex = '';
                    const newSpot = this.posToSpot(layer.posY);
                    const oldSpot = layer.spot;
                    this.move(layer.spot, newSpot);
                    if (oldSpot != newSpot) {
                        klHistory.pause(true);
                        this.onSelect(this.selectedSpotIndex);
                        klHistory.pause(false);
                    }
                    if (oldSpot === newSpot && freshSelection) {
                        this.onSelect(this.selectedSpotIndex);
                    }
                    freshSelection = false;
                }
            };

            layer.pointerListener = new BB.PointerListener({
                target: container1,
                onPointer: dragEventHandler,
            });

            this.layerListEl.append(layer);
        };
        this.layerElArr = [];
        while (this.layerListEl.firstChild) {
            const child = this.layerListEl.firstChild as TLayerEl;
            child.pointerListener.destroy();
            child.opacitySlider.destroy();
            this.layerListEl.removeChild(child);
        }
        for (let i = 0; i < this.klCanvasLayerArr.length; i++) {
            createLayerEntry(i);
        }
        this.activateLayer(this.selectedSpotIndex);
        this.updateHeight();
    }


    // ---- public ----
    constructor (
        klCanvas: KlCanvas,
        onSelect: (layerIndex: number) => void,
        parentEl: HTMLElement,
        uiState: TUiLayout,
    ) {
        this.parentEl = parentEl;
        this.klCanvas = klCanvas;
        this.layerElArr = [];
        this.layerHeight = 35;
        this.layerSpacing = 0;
        const width = 250;
        this.onSelect = onSelect;
        this.uiState = uiState;

        this.largeThumbDiv = BB.el({
            onClick: BB.handleClick,
            css: {
                position: 'absolute',
                top: '500px',
                background: '#aaa',
                boxShadow: '1px 1px 3px rgba(0,0,0,0.3)',
                pointerEvents: 'none',
                padding: '0',
                border: '1px solid #aaa',
                transition: 'opacity 0.3s ease-out',
                userSelect: 'none',
            },
        });
        this.setUiState(uiState);
        BB.createCheckerDataUrl(4, (url) => {
            this.largeThumbDiv.style.backgroundImage = 'url(' + url + ')';
        }, theme.isDark());
        this.largeThumbCanvas = BB.canvas(200, 200);
        this.largeThumbCanvas.style.display = 'block';
        this.largeThumbDiv.append(this.largeThumbCanvas);
        this.largeThumbInDocument = false;

        this.klCanvasLayerArr = this.klCanvas.getLayers();
        this.selectedSpotIndex = this.klCanvasLayerArr.length - 1;
        this.rootEl = BB.el({
            css: {
                marginRight: '10px',
                marginBottom: '10px',
                marginLeft: '10px',
                marginTop: '10px',
                cursor: 'default',
            },
        });

        const listDiv = BB.el({
            css: {
                width: width + 'px',
                position: 'relative',
            },
        });

        this.layerListEl = BB.el();

        this.addBtn = BB.el({tagName: 'button'}) as HTMLButtonElement;
        this.duplicateBtn = BB.el({tagName: 'button'}) as HTMLButtonElement;
        this.mergeBtn = BB.el({tagName: 'button'}) as HTMLButtonElement;
        this.removeBtn = BB.el({tagName: 'button'}) as HTMLButtonElement;
        const renameBtn = BB.el({tagName: 'button'}) as HTMLButtonElement;

        const createButtons = () => {
            const div = BB.el();
            const async = () => {
                BB.makeUnfocusable(this.addBtn);
                BB.makeUnfocusable(this.duplicateBtn);
                BB.makeUnfocusable(this.mergeBtn);
                BB.makeUnfocusable(this.removeBtn);
                BB.makeUnfocusable(renameBtn);

                this.addBtn.style.cssFloat = 'left';
                this.duplicateBtn.style.cssFloat = 'left';
                this.mergeBtn.style.cssFloat = 'left';
                this.removeBtn.style.cssFloat = 'left';
                renameBtn.style.cssFloat = 'left';

                this.addBtn.title = LANG('layers-new');
                this.duplicateBtn.title = LANG('layers-duplicate');
                this.removeBtn.title = LANG('layers-remove');
                this.mergeBtn.title = LANG('layers-merge');
                renameBtn.title = LANG('layers-rename-title');

                this.addBtn.style.paddingLeft = '5px';
                this.addBtn.style.paddingRight = '3px';

                this.removeBtn.style.paddingLeft = '5px';
                this.removeBtn.style.paddingRight = '3px';

                this.duplicateBtn.style.paddingLeft = '5px';
                this.duplicateBtn.style.paddingRight = '3px';

                this.mergeBtn.style.paddingLeft = '5px';
                this.mergeBtn.style.paddingRight = '3px';

                renameBtn.style.height = '30px';
                renameBtn.style.lineHeight = '20px';

                this.addBtn.innerHTML = "<img src='" + addLayerImg + "' height='20'/>";
                this.duplicateBtn.innerHTML = "<img src='" + duplicateLayerImg + "' height='20'/>";
                this.mergeBtn.innerHTML = "<img src='" + mergeLayerImg + "' height='20'/>";
                this.removeBtn.innerHTML = "<img src='" + removeLayerImg + "' height='20'/>";
                renameBtn.innerHTML = "<img src='" + renameLayerImg + "' height='20'/>";
                this.addBtn.style.marginRight = '5px';
                this.removeBtn.style.marginRight = '5px';
                this.duplicateBtn.style.marginRight = '5px';
                this.mergeBtn.style.marginRight = '5px';
                div.append(
                    this.addBtn,
                    this.removeBtn,
                    this.duplicateBtn,
                    this.mergeBtn,
                    renameBtn,
                    BB.el({
                        css: {
                            clear: 'both',
                            height: '10px',
                        },
                    }),
                );

                this.addBtn.onclick = () => {
                    if (this.klCanvas.addLayer(this.selectedSpotIndex) === false) {
                        return;
                    }
                    this.klCanvasLayerArr = this.klCanvas.getLayers();

                    if (this.klCanvasLayerArr.length === MAX_LAYERS) {
                        this.addBtn.disabled = true;
                        this.duplicateBtn.disabled = true;
                    }
                    this.removeBtn.disabled = false;
                    this.selectedSpotIndex = this.selectedSpotIndex + 1;
                    this.createLayerList();
                    klHistory.pause(true);
                    this.onSelect(this.selectedSpotIndex);
                    klHistory.pause(false);
                };
                this.duplicateBtn.onclick = () => {
                    if (this.klCanvas.duplicateLayer(this.selectedSpotIndex) === false) {
                        return;
                    }
                    this.klCanvasLayerArr = this.klCanvas.getLayers();
                    if (this.klCanvasLayerArr.length === MAX_LAYERS) {
                        this.addBtn.disabled = true;
                        this.duplicateBtn.disabled = true;
                    }
                    this.removeBtn.disabled = false;
                    this.selectedSpotIndex++;
                    this.createLayerList();
                    klHistory.pause(true);
                    this.onSelect(this.selectedSpotIndex);
                    klHistory.pause(false);
                };
                this.removeBtn.onclick = () => {
                    if (this.layerElArr.length <= 1) {
                        return;
                    }

                    this.klCanvas.removeLayer(this.selectedSpotIndex);
                    if (this.selectedSpotIndex > 0) {
                        this.selectedSpotIndex--;
                    }
                    this.klCanvasLayerArr = this.klCanvas.getLayers();
                    this.createLayerList();
                    klHistory.pause(true);
                    this.onSelect(this.selectedSpotIndex);
                    klHistory.pause(false);
                    if (this.klCanvasLayerArr.length === 1) {
                        this.removeBtn.disabled = true;
                    }
                    if (this.klCanvasLayerArr.length < MAX_LAYERS) {
                        this.addBtn.disabled = false;
                        this.duplicateBtn.disabled = false;
                    }
                };
                this.mergeBtn.onclick = () => {
                    if (this.selectedSpotIndex <= 0) {
                        return;
                    }
                    mergeLayerDialog(this.parentEl, {
                        topCanvas: this.klCanvasLayerArr[this.selectedSpotIndex].context.canvas,
                        bottomCanvas: this.klCanvasLayerArr[this.selectedSpotIndex - 1].context.canvas,
                        topOpacity: this.klCanvas.getLayer(this.selectedSpotIndex).opacity,
                        mixModeStr: this.klCanvasLayerArr[this.selectedSpotIndex].mixModeStr,
                        callback: (mode) => {
                            this.klCanvas.mergeLayers(this.selectedSpotIndex, this.selectedSpotIndex - 1, mode);
                            this.klCanvasLayerArr = this.klCanvas.getLayers();
                            this.selectedSpotIndex--;
                            if (this.klCanvasLayerArr.length === 1) {
                                this.removeBtn.disabled = true;
                            }
                            if (this.klCanvasLayerArr.length < MAX_LAYERS) {
                                this.addBtn.disabled = false;
                                this.duplicateBtn.disabled = false;
                            }
                            this.createLayerList();
                            klHistory.pause(true);
                            this.onSelect(this.selectedSpotIndex);
                            klHistory.pause(false);
                        },
                    });
                };

                renameBtn.onclick = () => {
                    this.renameLayer(this.selectedSpotIndex);
                };
            };
            setTimeout(async, 1);
            return div;
        };
        this.rootEl.append(createButtons());

        let modeWrapper;
        {
            modeWrapper = BB.el({
                content: LANG('layers-blending') + '&nbsp;',
                css: {
                    fontSize: '15px',
                },
            });

            this.modeSelect = new Select({
                optionArr: [
                    'source-over',
                    null,
                    'darken',
                    'multiply',
                    'color-burn',
                    null,
                    'lighten',
                    'screen',
                    'color-dodge',
                    null,
                    'overlay',
                    'soft-light',
                    'hard-light',
                    null,
                    'difference',
                    'exclusion',
                    null,
                    'hue',
                    'saturation',
                    'color',
                    'luminosity',
                ].map((item: TMixMode) => {
                    return item ? [item, translateBlending(item)] : null;
                }),
                onChange: (val) => {
                    this.klCanvas.setMixMode(this.selectedSpotIndex, val as TMixMode);
                    this.update(this.selectedSpotIndex);
                },
                css: {
                    marginBottom: '10px',
                },
            });

            modeWrapper.append(this.modeSelect.getElement());
            this.rootEl.append(modeWrapper);

        }


        listDiv.append(this.layerListEl);
        this.rootEl.append(listDiv);

        //updating the thumbs in interval
        //don't update when: manager not visible || layer didn't change || is drawing
        setInterval(() => {
            if (this.rootEl.style.display !== 'block') {
                return;
            }

            const historyState = klHistory.getState();
            if (historyState === this.oldHistoryState) {
                return;
            }
            this.oldHistoryState = historyState;

            for (let i = 0; i < this.layerElArr.length; i++) {
                if (this.selectedSpotIndex === this.layerElArr[i].spot && this.klCanvasLayerArr[this.layerElArr[i].spot]) { // second check, because might be out of date
                    const ctx = BB.ctx(this.layerElArr[i].thumb);
                    ctx.save();
                    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
                    if (this.klCanvasLayerArr[this.layerElArr[i].spot].context.canvas.width < this.layerElArr[i].thumb.width) {
                        ctx.imageSmoothingEnabled = false;
                    }
                    ctx.drawImage(this.klCanvasLayerArr[this.layerElArr[i].spot].context.canvas, 0, 0, this.layerElArr[i].thumb.width, this.layerElArr[i].thumb.height);
                    ctx.restore();
                }
            }

        }, 1);

        theme.addIsDarkListener(() => {
            this.createLayerList();
        });

        this.createLayerList();
    }

    // ---- interface ----
    update (activeLayerSpotIndex?: number): void {
        this.klCanvasLayerArr = this.klCanvas.getLayers();
        if (activeLayerSpotIndex || activeLayerSpotIndex === 0) {
            this.selectedSpotIndex = activeLayerSpotIndex;
        }
        this.removeBtn.disabled = this.klCanvasLayerArr.length === 1;
        if (this.klCanvasLayerArr.length === MAX_LAYERS) {
            this.addBtn.disabled = true;
            this.duplicateBtn.disabled = true;
        } else {
            this.addBtn.disabled = false;
            this.duplicateBtn.disabled = false;
        }
        setTimeout(() => this.createLayerList(), 1);
    }

    getSelected (): number {
        return this.selectedSpotIndex;
    }

    activateLayer (spotIndex: number): void {
        if (spotIndex < 0 || spotIndex > this.layerElArr.length - 1) {
            throw 'invalid spotIndex ' + spotIndex + ', layerElArr.length ' + this.layerElArr.length;
        }
        this.selectedSpotIndex = spotIndex;
        this.modeSelect.setValue(this.klCanvasLayerArr[this.selectedSpotIndex].mixModeStr);
        for (let i = 0; i < this.layerElArr.length; i++) {
            const layer = this.layerElArr[i];
            const isSelected = this.selectedSpotIndex === layer.spot;

            BB.css(layer, {
                boxShadow: '',
            });
            layer.classList.toggle('kl-layer--selected', isSelected);
            layer.opacitySlider.setActive(isSelected);
            layer.isSelected = isSelected;
        }
        this.mergeBtn.disabled = this.selectedSpotIndex === 0;
    }

    setUiState (stateStr: TUiLayout): void {
        this.uiState = stateStr;

        if (this.uiState === 'left') {
            BB.css(this.largeThumbDiv, {
                left: '280px',
                right: '',
            });
        } else {
            BB.css(this.largeThumbDiv, {
                left: '',
                right: '280px',
            });
        }
    }

    getElement (): HTMLElement {
        return this.rootEl;
    }

}
