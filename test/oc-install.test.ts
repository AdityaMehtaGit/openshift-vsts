/*-----------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE file in the project root for license information.
 *-----------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
// import sinon
import * as sinon from 'sinon';
import * as fs from 'fs';

import * as validUrl from 'valid-url';
import { IExecSyncResult } from 'azure-pipelines-task-lib/toolrunner';
import { InstallHandler } from '../src/oc-install';
// import * as ocinstall from '../src/oc-install';
import { RunnerHandler } from '../src/oc-exec';
import {
  LATEST,
  LINUX,
  OC_TAR_GZ,
  WIN,
  OC_ZIP,
  MACOSX
} from '../src/constants';

import { ToolRunnerStub } from './toolrunnerStub';
import * as utils from '../src/utils/utils';

const {expect} = chai;
import path = require('path');

import tl = require('azure-pipelines-task-lib/task');

describe('InstallHandler', () => {
  let sandbox: sinon.SinonSandbox;
  let stubs: ToolRunnerStub;
  const testOutDir = `${__dirname}/../out/test/ocInstall`;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    stubs = new ToolRunnerStub(sandbox);
    process.env.SYSTEM_DEFAULTWORKINGDIRECTORY = testOutDir;
  });

  afterEach(() => {
    sandbox.restore();
    delete process.env.SYSTEM_DEFAULTWORKINGDIRECTORY;
  });

  describe('#ocInstall', () => {
    it('check if latestStable method is called if no ocVersion is passed', async () => {
      const latestStub = sandbox.stub(InstallHandler, 'latestStable').returns('http://url.com/ocbundle');
      sandbox.stub(fs, 'existsSync').returns(true);
      sandbox.stub(InstallHandler, 'ocBundleURL').returns('url');
      sandbox.stub(InstallHandler, 'downloadAndExtract').resolves('path');
      await InstallHandler.installOc('', 'Darwin', false, '');
      expect(latestStub.calledOnce).to.be.true;
    });

    it('return error if lastest version is not found', async () => {
      sandbox.stub(InstallHandler, 'latestStable').returns(null);
      try {
        await InstallHandler.installOc('', 'Darwin', false, '');
        expect.fail();
      } catch (ex) {
        expect(ex.message).equals('Unable to determine latest oc download URL');
      }
    });

    it('check if ocBundle is not called if uri is valid', async () => {
      sandbox.stub(fs, 'existsSync').returns(true);
      const ocBundleStub = sandbox.stub(InstallHandler, 'ocBundleURL');
      sandbox.stub(InstallHandler, 'downloadAndExtract').resolves('path');
      await InstallHandler.installOc(
        'https://github.com/openshift/origin/releases/download/v3.11.0/openshift-origin-client-tools-v3.11.0-0cbc58b-mac.zip',
        'Darwin',
        false,
        ''
      );
      expect(ocBundleStub.calledOnce).to.be.false;
    });

    it('check if task fails if downloadAndExtract doesnt return a valid ocBinary', async () => {
      sandbox.stub(fs, 'existsSync').returns(true);
      sandbox.stub(validUrl, 'isWebUri').returns('path');
      sandbox.stub(InstallHandler, 'downloadAndExtract').resolves(null);
      try {
        await InstallHandler.installOc('path', 'Darwin', false, '');
        expect.fail();
      } catch (ex) {
        expect(ex.message).equals('Unable to download or extract oc binary.');
      }
    });

    it('check if value returned by downloadAndExtract if valid is returned', async () => {
      sandbox.stub(fs, 'existsSync').returns(true);
      sandbox.stub(validUrl, 'isWebUri').returns('path');
      sandbox.stub(InstallHandler, 'downloadAndExtract').resolves('path');
      const result = await InstallHandler.installOc(
        'path',
        'Darwin',
        false,
        ''
      );
      expect(result).equals('path');
    });
  });

  describe('#latestStable', () => {
    it('check if null value returned if osType input is not valid', () => {
      sandbox.stub(InstallHandler, 'getOcBundleByOS').returns(null);
      const res = InstallHandler.latestStable('fakeOS');
      expect(res).equals(null);
    });

    it('check if url returned is valid based on OSType input', () => {
      sandbox.stub(InstallHandler, 'getOcBundleByOS').returns('linux/oc.tar.gz');
      const res = InstallHandler.latestStable('linux');
      const ocUtils = InstallHandler.getOcUtils();
      expect(res).equals(
        `${ocUtils.openshiftV4BaseUrl}/${LATEST}/linux/oc.tar.gz`
      );
    });
  });

  describe('#ocBundleURL', () => {
    it('should return null when no version is passed', () => {
      const result = InstallHandler.ocBundleURL('', 'Linux');
      expect(result).to.be.null;
    });

    it('should return null when the version passed is null', () => {
      const result = InstallHandler.ocBundleURL(null, 'Linux');
      expect(result).to.be.null;
    });

    it('should return null if no valid version is passed', () => {
      const result = InstallHandler.ocBundleURL('version', 'Linux');
      expect(result).to.be.null;
    });

    it('should return correct url if oc version (v = 3) is valid', () => {
      const bundle = 'linux/oc.tar.gz';
      const version = '3.11.0';
      const ocUtils = InstallHandler.getOcUtils();
      const url = `${ocUtils.openshiftV3BaseUrl}/${version}/${bundle}`;
      sandbox.stub(InstallHandler, 'getOcBundleByOS').returns(bundle);
      const res = InstallHandler.ocBundleURL(version, 'Linux');
      expect(res).equals(url);
    });

    it('should return correct url if oc version (v = 3) is valid', () => {
      const bundle = 'linux/oc.tar.gz';
      const version = '4.11';
      const ocUtils = InstallHandler.getOcUtils();
      const url = `${ocUtils.openshiftV4BaseUrl}/${version}/${bundle}`;
      sandbox.stub(InstallHandler, 'getOcBundleByOS').returns(bundle);
      const res = InstallHandler.ocBundleURL(version, 'Linux');
      expect(res).equals(url);
    });

    it('should return null if oc version requested is different from the versions supported (3 and 4)', () => {
      const version = '5.1.0';
      const res = InstallHandler.ocBundleURL(version, 'Linux');
      expect(res).equals(null);
    });

    it('should return null if no oc bundle url is found', () => {
      const version = '4.11';
      sandbox.stub(InstallHandler, 'getOcBundleByOS').returns(null);
      const res = InstallHandler.ocBundleURL(version, 'Linux');
      expect(res).equals(null);
    });

    it('should return null if latest version is requestd but version passed as param is invalid', () => {
      const version = '3';
      const res = InstallHandler.ocBundleURL(version, 'Linux', true);
      expect(res).equals(null);
    });

    it('should return null if latest version is requestd but version passed as param dont have a latest version', () => {
      const version = '3.17';
      const res = InstallHandler.ocBundleURL(version, 'Linux', true);
      expect(res).equals(null);
    });
  });

  describe('#downloadAndExtract', () => {
    it('return null if url is not valid', async () => {
      const res = await InstallHandler.downloadAndExtract(
        '',
        'path',
        'Linux',
        'ip:port'
      );
      expect(res).to.be.null;
    });

    it('throw error if download dir no exists', async () => {
      const normalizeStub = sandbox.stub(path, 'normalize').returns('path');
      sandbox.stub(tl, 'exist').returns(false);
      try {
        await InstallHandler.downloadAndExtract(
          'url',
          'path',
          'Linux',
          'ip:port'
        );
        normalizeStub.calledOnce;
        expect.fail();
      } catch (err) {
        expect(err.message).equals('path does not exist.');
      }
    });

    it('curl is called if archive path no exists', async () => {
      sandbox.stub(path, 'normalize').returns('path');
      sandbox
        .stub(tl, 'exist')
        .onFirstCall()
        .returns(true)
        .onSecondCall()
        .returns(false);
      const toolStub = sandbox.stub(tl, 'tool').returns(stubs.tr);
      try {
        await InstallHandler.downloadAndExtract('url', 'path', 'Linux', '');
      } catch (ex) {}
      sinon.assert.calledWith(toolStub, 'curl');
      expect(stubs.args.length).equals(5);
    });

    it('curl is called with -x arg if proxy is valid', async () => {
      sandbox.stub(path, 'normalize').returns('path');
      sandbox
        .stub(tl, 'exist')
        .onFirstCall()
        .returns(true)
        .onSecondCall()
        .returns(false);
      sandbox.stub(tl, 'tool').returns(stubs.tr);
      try {
        await InstallHandler.downloadAndExtract(
          'url',
          'path',
          'Linux',
          'ip:port'
        );
      } catch (ex) {}

      expect(stubs.args.length).equals(7);
    });

    it('null if oc path no exists', async () => {
      sandbox.stub(path, 'normalize').returns('path');
      sandbox
        .stub(tl, 'exist')
        .onFirstCall()
        .returns(true)
        .onSecondCall()
        .returns(true)
        .onThirdCall()
        .returns(false);
      sandbox.stub(utils, 'unzipArchive');
      const res = await InstallHandler.downloadAndExtract(
        'url',
        'path',
        'Linux',
        'ip:port'
      );
      expect(res).equals(null);
    });

    it('check if correct oc path for Windows', async () => {
      sandbox.stub(path, 'normalize').returns('path');
      sandbox
        .stub(tl, 'exist')
        .onFirstCall()
        .returns(true)
        .onSecondCall()
        .returns(true)
        .onThirdCall()
        .returns(true);
      sandbox.stub(utils, 'unzipArchive');
      sandbox.stub(path, 'join').returns('path/oc.exe');
      sandbox.stub(fs, 'chmodSync');
      const res = await InstallHandler.downloadAndExtract(
        'url',
        'path',
        'Windows_NT',
        'ip:port'
      );
      expect(res).equals('path/oc.exe');
    });

    it('check if correct oc path for Linux/Mac', async () => {
      sandbox.stub(path, 'normalize').returns('path');
      sandbox
        .stub(tl, 'exist')
        .onFirstCall()
        .returns(true)
        .onSecondCall()
        .returns(true)
        .onThirdCall()
        .returns(true);
      sandbox.stub(utils, 'unzipArchive');
      sandbox.stub(path, 'join').returns('path/oc');
      const chmod = sandbox.stub(fs, 'chmodSync');
      const res = await InstallHandler.downloadAndExtract(
        'url',
        'path',
        'Linux',
        'ip:port'
      );
      expect(res).equals('path/oc');
      sinon.assert.calledWith(chmod, 'path/oc', '0755');
    });
  });

  describe('#getOcBundleByOS', () => {
    it('return correct value if osType is linux', () => {
      const res = InstallHandler.getOcBundleByOS('Linux');
      expect(res).equals(`${LINUX}/${OC_TAR_GZ}`);
    });

    it('return correct value if osType is windows', () => {
      const res = InstallHandler.getOcBundleByOS('Windows_NT');
      expect(res).equals(`${WIN}/${OC_ZIP}`);
    });

    it('return correct value if osType is MACOSX', () => {
      const res = InstallHandler.getOcBundleByOS('Darwin');
      expect(res).equals(`${MACOSX}/${OC_TAR_GZ}`);
    });

    it('return null if osType is neither linux nor macosx nor windows', () => {
      const res = InstallHandler.getOcBundleByOS('fakeOS');
      expect(res).equals(null);
    });
  });

  describe('#addOcToPath', () => {
    it('adds oc to PATH under Windows', () => {
      const ocDir =
        'D:\\a\\r1\\a\\.download\\openshift-origin-client-tools-v3.10.0-dd10d17-windows';
      expect(tl.getVariable('PATH')).to.not.contain(ocDir);
      InstallHandler.addOcToPath(`${ocDir}\\oc.exe`, 'Windows_NT');
      expect(tl.getVariable('PATH')).to.contain(ocDir);
    });

    it('adds oc to PATH under macOS', () => {
      const ocDir =
        '/a/r1/a/.download/openshift-origin-client-tools-v3.10.0-dd10d17-mac';
      expect(tl.getVariable('PATH')).to.not.contain(ocDir);
      InstallHandler.addOcToPath(`${ocDir}/oc`, 'Darwin');
      expect(tl.getVariable('PATH')).to.contain(ocDir);
    });

    it('adds oc to PATH under Linux', () => {
      const ocDir =
        '/a/r1/a/.download/openshift-origin-client-tools-v3.10.0-dd10d17-linux-64bit';
      expect(tl.getVariable('PATH')).to.not.contain(ocDir);
      InstallHandler.addOcToPath(`${ocDir}/oc`, 'Linux');
      expect(tl.getVariable('PATH')).to.contain(ocDir);
    });

    it('throws error with null path', () => {
      try {
        InstallHandler.addOcToPath(null, 'Linux');
        expect.fail();
      } catch (err) {
        expect(err.message).to.eq('path cannot be null or empty');
      }
    });

    it('throws error with empty path', () => {
      try {
        InstallHandler.addOcToPath('', 'Linux');
        expect.fail();
      } catch (err) {
        expect(err.message).to.eq('path cannot be null or empty');
      }
    });
  });

  describe('#getlocalOcPath', () => {
    it('returns path found by which if no error occurs and there is no version as input', () => {
      const whichStub = sandbox.stub(tl, 'which').returns('path');
      const res = InstallHandler.getLocalOcPath();
      sinon.assert.calledWith(whichStub, 'oc');
      expect(res).equals('path');
    });

    it('returns undefined if which fails retrieving oc path', () => {
      sandbox.stub(tl, 'which').throws();
      const res = InstallHandler.getLocalOcPath('1.1');
      expect(res).equals(undefined);
    });

    it('returns nothing if oc path exists but oc version cannot be retrieved', () => {
      sandbox.stub(tl, 'which').returns('path');
      const getOcStub = sandbox
        .stub(InstallHandler, 'getOcVersion')
        .returns(undefined);
      const res = InstallHandler.getLocalOcPath('1.1');
      sinon.assert.calledWith(getOcStub, 'path');
      expect(res).equals(undefined);
    });

    it('returns nothing if version found locally is not the one user wants to use', () => {
      sandbox.stub(tl, 'which').returns('path');
      sandbox.stub(InstallHandler, 'getOcVersion').returns('2.1');
      const res = InstallHandler.getLocalOcPath('1.1');
      expect(res).equals(undefined);
    });
  });

  describe('#getOcVersion', () => {
    const versionRes: IExecSyncResult = {
      code: 1,
      error: undefined,
      stderr: undefined,
      stdout: 'xxxxxx v4.1.0 xxxxxx xxxxxxx xxxxxx'
    };
    let execOcStub: sinon.SinonStub;

    beforeEach(() => {
      execOcStub = sandbox.stub(RunnerHandler, 'execOcSync');
    });

    it('check if correct version is returned if oc version > 4', () => {
      execOcStub.returns(versionRes);
      const res = InstallHandler.getOcVersion('path');
      expect(res).equals('v4.1.0');
    });

    it('check if execOcSync is called twice if first call returns nothing', () => {
      execOcStub
        .onFirstCall()
        .returns(undefined)
        .onSecondCall()
        .returns(undefined);
      InstallHandler.getOcVersion('path');
      sinon.assert.calledTwice(execOcStub);
    });

    it('check if correct version is returned if first execOcSync method fails = oc version < 4', () => {
      versionRes.stdout = 'xxxxxx v3.2.0 xxxxxx xxxxxxx xxxxxx';
      execOcStub
        .onFirstCall()
        .returns(undefined)
        .onSecondCall()
        .returns(versionRes);
      const res = InstallHandler.getOcVersion('path');
      expect(res).equals('v3.2.0');
    });

    it('returns undefined if both oc calls fail', () => {
      execOcStub
        .onFirstCall()
        .returns(undefined)
        .onSecondCall()
        .returns(undefined);
      const res = InstallHandler.getOcVersion('path');
      expect(res).equals(undefined);
    });

    it('returns undefined if second call stdout is empty', () => {
      versionRes.stdout = undefined;
      execOcStub
        .onFirstCall()
        .returns(undefined)
        .onSecondCall()
        .returns(versionRes);
      const res = InstallHandler.getOcVersion('path');
      expect(res).equals(undefined);
    });

    it('returns undefined if execOcSync returns a not empty stdout without a valid version in it', () => {
      versionRes.stdout = 'xxxxx xxxxx xxxxxx xxxxxx xxxxx';
      execOcStub.returns(versionRes);
      const res = InstallHandler.getOcVersion('path');
      expect(res).equals(undefined);
    });
  });
});
