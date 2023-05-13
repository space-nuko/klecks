import { BB } from '../../../bb/bb';
import { input } from '../components/input';
import { showModal } from './base/showModal';
import { LANG } from '../../../language/language';
import copyImg from '../../../../img/ui/copy.svg';
import { IRGB } from '../../kl-types';
import { RGB } from '../../../bb/color/color';


type TInputRow = {
    update: () => void;
    destroy: () => void;
};

/**
 * dialog for manually inputting the color
 */
export class HexColorDialog {


    // ---- public ----
    constructor(
        p: {
            color: IRGB;
            onClose: (rgb: IRGB | null) => void;
        }
    ) {
        let lastValidRgb: RGB = new BB.RGB(p.color.r, p.color.g, p.color.b);

        const div = BB.el();

        const previewEl = BB.el({
            css: {
                width: '20px',
                height: '20px',
                marginBottom: '10px',
                boxShadow: 'inset 0 0 0 1px #fff, 0 0 0 1px #000',
                background: '#' + BB.ColorConverter.toHexString(lastValidRgb),
            },
        });
        div.append(previewEl);


        // --- Hex ---
        const hexRowEl = BB.el({
            css: {
                display: 'flex',
                alignItems: 'center',
                marginBottom: '15px',
            },
        });
        const hexLabel = BB.el({
            content: LANG('mci-hex'),
            css: {
                width: '60px',
            },
        });
        const hexInput = input({
            init: '#' + BB.ColorConverter.toHexString(lastValidRgb),
            css: {
                width: '80px',
            },
            callback: function() {
                let rgbObj = BB.ColorConverter.hexToRGB(hexInput.value);
                if (rgbObj === null) {
                    rgbObj = lastValidRgb;
                    hexInput.value = '#' + BB.ColorConverter.toHexString(lastValidRgb);
                } else {
                    lastValidRgb = rgbObj;
                }
                previewEl.style.background = '#' + BB.ColorConverter.toHexString(rgbObj);

                for (let i = 0; i < rgbArr.length; i++) {
                    rgbArr[i].update();
                }
            },
        });
        const copyButton = BB.el({
            tagName: 'button',
            content: '<img src="' + copyImg + '" height="20"/>',
            title: LANG('mci-copy'),
            css: {
                marginLeft: '10px',
            },
            onClick: function() {
                hexInput.select();
                document.execCommand('copy');
            },
        });
        hexRowEl.append(hexLabel, hexInput, copyButton);
        div.append(hexRowEl);
        setTimeout(function() {
            hexInput.focus();
            hexInput.select();
        }, 0);


        // --- R G B ---
        function createRgbInputRow(labelStr: string, attributeStr: 'r' | 'g' | 'b'): TInputRow {

            const rowEl = BB.el({
                css: {
                    display: 'flex',
                    alignItems: 'center',
                    marginTop: '5px',
                },
            });
            const labelEl = BB.el({
                content: labelStr,
                css: {
                    width: '60px',
                },
            });

            const inputEl = input({
                init: lastValidRgb[attributeStr],
                min: 0,
                max: 255,
                type: 'number',
                css: {
                    width: '80px',
                },
                callback: function() {
                    if (inputEl.value === '' || parseFloat(inputEl.value) < 0 || parseFloat(inputEl.value) > 255) {
                        result.update();
                        return;
                    }
                    inputEl.value = '' + Math.round(parseFloat(inputEl.value));
                    lastValidRgb[attributeStr] = Number(inputEl.value);
                    previewEl.style.background = '#' + BB.ColorConverter.toHexString(lastValidRgb);
                    hexInput.value = '#' + BB.ColorConverter.toHexString(lastValidRgb);
                },
            });

            rowEl.append(labelEl, inputEl);
            div.append(rowEl);

            const result = {
                update: () => {
                    inputEl.value = '' + lastValidRgb[attributeStr];
                },
                destroy: () => {
                    inputEl.onchange = null;
                },
            };
            return result;
        }
        const rgbArr: TInputRow[] = [];
        rgbArr.push(createRgbInputRow(LANG('red'), 'r'));
        rgbArr.push(createRgbInputRow(LANG('green'), 'g'));
        rgbArr.push(createRgbInputRow(LANG('blue'), 'b'));


        showModal({
            target: document.body,
            message: `<b>${LANG('manual-color-input')}</b>`,
            div: div,
            autoFocus: false,
            clickOnEnter: 'Ok',
            buttons: ['Ok', 'Cancel'],
            callback: function(resultStr) {
                BB.destroyEl(copyButton);
                rgbArr.forEach(item => item.destroy());
                rgbArr.splice(0, rgbArr.length);

                p.onClose(resultStr === 'Ok' ? BB.ColorConverter.hexToRGB(hexInput.value) : null);
            },
        });
    }

}
