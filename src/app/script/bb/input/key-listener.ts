import {IKeyString} from '../bb-types';

type TGlobalKey = {
    add: (keyListenerRef: TKeyListenerRef) => void;
    remove: (keyListenerRef: TKeyListenerRef) => void;
    getIsDown: () => TIsDown;
    getCombo: () => string[];
}

type TIsDown = {
    [key: string]: boolean;
};

type TOnDown = (keyStr: string, e: KeyboardEvent, comboStr: string, isRepeat?: boolean) => void;
type TOnUp = (keyStr: string, e: KeyboardEvent, oldComboStr: string) => void;
type TOnBlur = () => void;
type TKeyListenerRef = [
    TOnDown | undefined,
    TOnUp | undefined,
    TOnBlur | undefined,
];


const globalKey = ((): TGlobalKey => {

    // keyStr - our key naming system
    // key - KeyboardEvent.key
    // code - KeyboardEvent.code

    const keyStrToKeyObj = { // keyStr not to contain a '+', because that's used for the comboStr
        'space': [' ', 'Spacebar'], // Spacebar in IE
        'alt': ['Alt', 'AltGraph'],
        'shift': 'Shift',
        'ctrl': 'Control',
        'cmd': ['Meta', 'MetaLeft', 'MetaRight'],
        'enter': 'Enter',
        'esc': 'Escape',
        'backspace': 'Backspace',
        'delete': 'Delete',
        'sqbr_open': '[',
        'sqbr_close': ']',
        'a': ['a', 'A'],
        'b': ['b', 'B'],
        'c': ['c', 'C'],
        'e': ['e', 'E'],
        'f': ['f', 'F'],
        'g': ['g', 'G'],
        'r': ['r', 'R'], // when holding shift
        's': ['s', 'S'],
        't': ['t', 'T'],
        'u': ['u', 'U'],
        'x': ['x', 'X'],
        'y': ['y', 'Y'],
        'z': ['z', 'Z'],
        'plus': '+',
        'minus': '-',
        'left': 'ArrowLeft',
        'right': 'ArrowRight',
        'up': 'ArrowUp',
        'down': 'ArrowDown',
        'home': 'Home',
        'end': 'End',
    };

    // ['space', 'alt', ... ]
    const keyStrArr = Object.keys(keyStrToKeyObj);

    // { space: false, ... }
    const isDownObj: TIsDown = Object.entries(keyStrToKeyObj).reduce((acc, [key]) => {
        acc[key] = false;
        return acc;
    }, {} as TIsDown);

    // event.key to keyStr
    // { ArrowLeft: 'left', ... }
    const keyToKeyStrObj = Object.entries(keyStrToKeyObj).reduce((acc, [key, code]) => {
        if (typeof code === 'string') {
            acc[code] = key;
        } else {
            code.forEach(item => {
                acc[item] = key;
            });
        }
        return acc;
    }, {} as IKeyString);

    let comboArr: string[] = [];

    // a physical key's "key" can change as other keys get pressed. to keep track, need to also track the code
    // { KeyE: 'e', KeyF: undefined } - undefined - not down, string - the associated keyStr
    let codeIsDownObj: {
        [key: string]: string | undefined;
    } = {};
    const listenerArr: TKeyListenerRef[] = [];


    const emitDown: TOnDown = function (a, b, c, d?): void {
        listenerArr.forEach(item => {
            if (!item[0]) {
                return;
            }
            item[0](a, b, c, d);
        });
    };

    const emitUp: TOnUp = function (a, b, c): void {
        listenerArr.forEach(item => {
            if (!item[1]) {
                return;
            }
            item[1](a, b, c);
        });
    };

    const emitBlur: TOnBlur = function (): void {
        listenerArr.forEach(item => {
            if (!item[2]) {
                return;
            }
            item[2]();
        });
    };

    function keyDown (e: KeyboardEvent): void {
        const key = e.key;
        const code = e.code;

        if (key in keyToKeyStrObj) {
            const keyStr = keyToKeyStrObj[key];
            if (isDownObj[keyStr]) {
                emitDown(keyStr, e, comboArr.join('+'), true);
                return;
            }
            isDownObj[keyStr] = true;
            codeIsDownObj[code] = keyStr;

            //add to combo
            comboArr.push(keyStr);

            emitDown(keyStr, e, comboArr.join('+'));
        }
    }


    function keyUp (e: KeyboardEvent): void {
        const code = e.code;
        const oldComboStr = comboArr.join('+');

        // because of a macOS bug: when meta key is down, keyup of other keys does not fire.
        // https://stackoverflow.com/questions/25438608/javascript-keyup-isnt-called-when-command-and-another-is-pressed
        if ([
            'Meta', 'MetaLeft', 'MetaRight',
            'OSLeft', 'OSRight', // Firefox
        ].includes(code)) {
            blur();
            return;
        }

        const keyStr = codeIsDownObj[code];
        if (keyStr !== undefined) {
            isDownObj[keyStr] = false;
            codeIsDownObj[code] = undefined;

            // remove from combo
            for (let i = 0; i < comboArr.length; i++) {
                if (comboArr[i] == keyStr) {
                    comboArr.splice(i, 1);
                    i--;
                }
            }

            emitUp(keyStr, e, oldComboStr);
        }
    }

    function blur (): void {
        const oldComboStr = comboArr.join('+');
        comboArr = [];
        codeIsDownObj = {};

        const eventArr: string[] = [];
        keyStrArr.forEach(keyStr => {
            if (isDownObj[keyStr]) {
                isDownObj[keyStr] = false;
                eventArr.push(keyStr);
            }
        });
        for (let i = 0; i < eventArr.length; i++) {
            emitUp(
                eventArr[i],
                {
                    preventDefault: function () {},
                    stopPropagation: function () {},
                } as KeyboardEvent,
                oldComboStr,
            );
        }
        emitBlur();
    }



    return {
        add: (keyListenerRef: TKeyListenerRef): void => {
            if (listenerArr.includes(keyListenerRef)) {
                return;
            }
            const first = listenerArr.length === 0;
            listenerArr.push(keyListenerRef);

            if (first) {
                document.addEventListener('keydown', keyDown);
                document.addEventListener('keyup', keyUp);
                window.addEventListener('blur', blur);
            }
        },
        remove: (keyListenerRef: TKeyListenerRef): void => {
            if (!listenerArr.includes(keyListenerRef)) {
                return;
            }
            const last = listenerArr.length === 1;
            for (let i = 0; i < listenerArr.length; i++) {
                if (listenerArr[i] === keyListenerRef) {
                    listenerArr.splice(i, 1);
                    break;
                }
            }
            if (last) {
                document.removeEventListener('keydown', keyDown);
                document.removeEventListener('keyup', keyUp);
                window.removeEventListener('blur', blur);
            }
        },
        getIsDown: (): TIsDown => isDownObj,
        getCombo: (): string[] => comboArr,
    };
})();



/**
 * Listens to key events in window. Makes combos easier - e.g. ctrl + z
 *
 * keyStr - see in implementation - my representation of a key. e.g. 'r' can be 'r' and 'R'
 * comboStr - string joins currently pressed keyStr with a +
 *              e.g. 'ctrl+z'
 *
 */
export class KeyListener {

    private readonly onDown: TOnDown | undefined;
    private readonly onUp: TOnUp | undefined;
    private readonly onBlur: TOnBlur | undefined;
    private readonly ref: TKeyListenerRef;

    constructor (
        p: {
            onDown?: TOnDown;
            onUp?: TOnUp;
            onBlur?: TOnBlur;
        },
    ) {
        this.onDown = p.onDown;
        this.onUp = p.onUp;
        this.onBlur = p.onBlur;
        this.ref = [this.onDown, this.onUp, this.onBlur];
        globalKey.add(this.ref);
    }

    isPressed (keyStr: string): boolean {
        if (!(keyStr in globalKey.getIsDown())) {
            throw 'key "' + keyStr + '" not found';
        }
        return globalKey.getIsDown()[keyStr];
    }

    getComboStr (): string {
        return globalKey.getCombo().join('+');
    }

    comboOnlyContains (keyStrArr: string[]): boolean {
        for (let i = 0; i < globalKey.getCombo().length; i++) {
            if (!keyStrArr.includes(globalKey.getCombo()[i])) {
                return false;
            }
        }
        return true;
    }

    destroy (): void {
        globalKey.remove(this.ref);
    }
}

/**
 * Test, are the same keys pressed. Order does not matter.
 */
export function sameKeys (comboAStr: string, comboBStr: string): boolean {
    return comboAStr.split('+').sort().join('+') === comboBStr.split('+').sort().join('+');
}