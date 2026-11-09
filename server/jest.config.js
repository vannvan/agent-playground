"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ts_jest_1 = require("ts-jest");
const typescript_1 = __importDefault(require("typescript"));
const { config: tsconfig } = typescript_1.default.readConfigFile('./tsconfig.json', typescript_1.default.sys.readFile);
const paths = tsconfig?.compilerOptions?.paths ?? {};
const config = {
    moduleFileExtensions: ['js', 'json', 'ts'],
    rootDir: '.',
    testRegex: '.*\\.spec\\.ts$',
    extensionsToTreatAsEsm: ['.ts'],
    transform: {
        '^.+\\.ts$': [
            'ts-jest',
            { useESM: true, tsconfig: { module: 'ES2022', moduleResolution: 'Bundler' } },
        ],
    },
    moduleNameMapper: (0, ts_jest_1.pathsToModuleNameMapper)(paths, { prefix: '<rootDir>/' }),
    collectCoverageFrom: [
        'src/**/*.(t|j)s',
        'libs/**/*.(t|j)s',
        'apps/**/*.(t|j)s',
    ],
    coverageDirectory: './coverage',
    testEnvironment: 'node',
};
exports.default = config;
//# sourceMappingURL=jest.config.js.map