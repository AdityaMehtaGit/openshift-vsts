/*-----------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE file in the project root for license information.
 *-----------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import {
  ToolRunner,
  IExecSyncResult
} from 'azure-pipelines-task-lib/toolrunner';
import { RunnerHandler } from './oc-exec';
import { LINUX, OC_TAR_GZ, MACOSX, WIN, OC_ZIP, LATEST } from './constants';
import { unzipArchive } from './utils/utils';

import tl = require('azure-pipelines-task-lib/task');
import path = require('path');
import validUrl = require('valid-url');
import fetch = require('node-fetch');

export class InstallHandler {
  /**
   * Downloads the specified version of the oc CLI and returns the full path to
   * the executable.
   *
   * @param downloadVersion the version of `oc` to install.
   * @param osType the OS type. One of 'Linux', 'Darwin' or 'Windows_NT'. See https://nodejs.org/api/os.html#os_os_type
   * @param useLocalOc if user prefer to use the current oc cli already installed in his machine
   * @param proxy proxy to use to download oc
   * @return the full path to the installed executable or null if the install failed.
   */
  static async installOc(
    downloadVersion: string,
    osType: string,
    useLocalOc: boolean,
    proxy: string
  ): Promise<string | null> {
    if (useLocalOc) {
      const localOcPath = InstallHandler.getLocalOcPath(downloadVersion);
      if (localOcPath) {
        return localOcPath;
      }
    }

    if (!downloadVersion) {
      downloadVersion = InstallHandler.latestStable(osType);
      if (downloadVersion === null) {
        return Promise.reject(new Error('Unable to determine latest oc download URL'));
      }
    }

    tl.debug('creating download directory');
    const downloadDir =
      `${process.env.SYSTEM_DEFAULTWORKINGDIRECTORY  }/.download`;
    if (!fs.existsSync(downloadDir)) {
      tl.mkdirP(downloadDir);
    }

    let url: string | null;
    if (validUrl.isWebUri(downloadVersion)) {
      url = downloadVersion;
    } else {
      url = InstallHandler.ocBundleURL(downloadVersion, osType, false);
      // check if url is valid otherwise take the latest stable oc cli for this version
      const response = await fetch(url, {
        method: 'HEAD'
      });
      if (!response.ok) {
        url = InstallHandler.ocBundleURL(downloadVersion, osType, true);
      }
    }

    if (url === null) {
      return Promise.reject(new Error('Unable to determine oc download URL.'));
    }

    tl.debug(`downloading: ${url}`);
    const ocBinary = await InstallHandler.downloadAndExtract(
      url,
      downloadDir,
      osType,
      proxy
    );
    if (ocBinary === null) {
      return Promise.reject(new Error('Unable to download or extract oc binary.'));
    }

    return ocBinary;
  }

  /**
   * Determines the latest stable version of the OpenShift CLI on mirror.openshift.
   *
   * @return the url of the latest OpenShift CLI on mirror.openshift.
   */
  static latestStable(osType: string): string | null {
    tl.debug('determining latest oc version');

    const bundle = InstallHandler.getOcBundleByOS(osType);
    if (!bundle) {
      tl.debug('Unable to find bundle url');
      return null;
    }
    const ocUtils = InstallHandler.getOcUtils();
    const url = `${ocUtils.openshiftV4BaseUrl}/${LATEST}/${bundle}`;

    tl.debug(`latest stable oc version: ${url}`);
    return url;
  }

  /**
   * Returns the download URL for the oc CLI for a given version v(major).(minor).(patch) (e.g v3.11.0).
   * The binary type is determined by the agent's operating system.
   *
   * @param {string} version Oc version.
   * @param osType the OS type. One of 'Linux', 'Darwin' or 'Windows_NT'.
   * @returns {Promise} Promise string representing the URL to the tarball. null is returned
   * if no matching URL can be determined for the given tag.
   */
  static ocBundleURL(version: string, osType: string, latest?: boolean): string | null {
    tl.debug(`determining tarball URL for version ${version}`);

    if (!version) {
      return null;
    }

    // remove char v if present to ensure old pipelines keep working when the extension will be updated
    if (version.startsWith('v')) {
      version = version.substr(1);
    }

    let url = '';
    // determine the base_url based on version
    let reg = new RegExp('\\d+(?=\\.)');
    const vMajorRegEx: RegExpExecArray = reg.exec(version);
    if (!vMajorRegEx || vMajorRegEx.length === 0) {
      tl.debug('Error retrieving version major');
      return null;
    }
    const vMajor: number = +vMajorRegEx[0];
    const ocUtils = InstallHandler.getOcUtils();

    // if we need the latest correct release of this oc version we need to retrieve the (major).(minor) of the version
    if (latest) {
      reg = new RegExp('\\d+\\.\\d+(?=\\.)*');
      const versionRegEx: RegExpExecArray = reg.exec(version);
      if (!versionRegEx || versionRegEx.length === 0) {
        tl.debug(
          'Error retrieving version release - unable to find latest version'
        );
        return null;
      }
      const baseVersion: string = versionRegEx[0]; // e.g 3.11
      if (!ocUtils[`oc${baseVersion}`]) {
        tl.debug(`Error retrieving latest patch for oc version ${baseVersion}`);
        return null;
      }
      version = ocUtils[`oc${baseVersion}`];
    }

    if (vMajor === 3) {
      url = `${ocUtils.openshiftV3BaseUrl}/${version}/`;
    } else if (vMajor === 4) {
      url = `${ocUtils.openshiftV4BaseUrl}/${version}/`;
    } else {
      tl.debug('Invalid version');
      return null;
    }

    const bundle = InstallHandler.getOcBundleByOS(osType);
    if (!bundle) {
      tl.debug('Unable to find bundle url');
      return null;
    }

    url += bundle;

    tl.debug(`archive URL: ${url}`);
    return url;
  }

  static getOcBundleByOS(osType: string): string | null {
    let url = '';

    // determine the bundle path based on the OS type
    switch (osType) {
      case 'Linux': {
        url += `${LINUX}/${OC_TAR_GZ}`;
        break;
      }
      case 'Darwin': {
        url += `${MACOSX}/${OC_TAR_GZ}`;
        break;
      }
      case 'Windows_NT': {
        url += `${WIN}/${OC_ZIP}`;
        break;
      }
      default: {
        return null;
      }
    }

    return url;
  }

  /**
   * Downloads and extract the oc release archive.
   *
   * @param url the oc release download URL.
   * @param downloadDir the directory into which to extract the archive.
   * @param osType the OS type. One of 'Linux', 'Darwin' or 'Windows_NT'.
   * @param proxy proxy to use to download oc
   * It is the responsibility of the caller to ensure that the directory exist.
   */
  static async downloadAndExtract(
    url: string,
    downloadDir: string,
    osType: string,
    proxy: string
  ): Promise<string | null> {
    if (!url) {
      return null;
    }

    downloadDir = path.normalize(downloadDir);

    if (!tl.exist(downloadDir)) {
      return Promise.reject(new Error(`${downloadDir} does not exist.`));
    }

    const parts = url.split('/');
    const archive = parts[parts.length - 1];
    const archivePath = path.join(downloadDir, archive);

    if (!tl.exist(archivePath)) {
      const curl: ToolRunner = tl.tool('curl');
      curl
        .arg('-s')
        .argIf(!!proxy, ['-x', proxy])
        .arg('-L')
        .arg('-o')
        .arg(archivePath)
        .arg(url);
      await curl.exec();
    }

    let archiveType = path.extname(archive);
    let expandDir = archive.replace(archiveType, '');
    // handle tar.gz explicitly
    if (path.extname(expandDir) === '.tar') {
      archiveType = '.tar.gz';
      expandDir = expandDir.replace('.tar', '');
    }

    tl.debug(`expanding ${archivePath} into ${downloadDir}`);

    await unzipArchive(archiveType, archivePath, downloadDir);

    let ocBinary: string;
    switch (osType) {
      case 'Windows_NT': {
        ocBinary = 'oc.exe';
        break;
      }
      default: {
        ocBinary = 'oc';
      }
    }

    ocBinary = path.join(downloadDir, ocBinary);
    if (!tl.exist(ocBinary)) {
      return null;
    }

    fs.chmodSync(ocBinary, '0755');
    return ocBinary;
  }

  /**
   * Adds oc to the PATH environment variable.
   *
   * @param ocPath the full path to the oc binary. Must be a non null.
   * @param osType the OS type. One of 'Linux', 'Darwin' or 'Windows_NT'.
   */
  static addOcToPath(ocPath: string, osType: string): void{
    if (ocPath === null || ocPath === '') {
      throw new Error('path cannot be null or empty');
    }

    if (osType === 'Windows_NT') {
      const dir = ocPath.substr(0, ocPath.lastIndexOf('\\'));
      tl.setVariable('PATH', `${dir  };${  tl.getVariable('PATH')}`);
    } else {
      const dir = ocPath.substr(0, ocPath.lastIndexOf('/'));
      tl.setVariable('PATH', `${dir  }:${  tl.getVariable('PATH')}`);
    }
  }

  /**
   * Retrieve the path of the oc CLI installed in the machine.
   *
   * @param version the version of `oc` to be used. If not specified any `oc` version, if found, will be used.
   * @return the full path to the installed executable or undefined if the oc CLI version requested is not found.
   */
  static getLocalOcPath(version?: string): string | undefined {
    let ocPath: string | undefined;
    try {
      ocPath = tl.which('oc', true);
      tl.debug(`ocPath ${ocPath}`);
    } catch (ex) {
      tl.debug(`Oc has not been found on this machine. Err ${  ex}`);
    }

    if (version && ocPath) {
      const localOcVersion = InstallHandler.getOcVersion(ocPath);
      tl.debug(`localOcVersion ${localOcVersion} vs ${version}`);
      if (
        !localOcVersion ||
        localOcVersion.toLowerCase() !== version.toLowerCase()
      ) {
        return undefined;
      }
    }

    return ocPath;
  }

  static getOcVersion(ocPath: string): string {
    let result: IExecSyncResult | undefined = RunnerHandler.execOcSync(
      ocPath,
      'version --short=true --client=true'
    );

    if (!result || result.stderr) {
      tl.debug(`error ${result && result.stderr ? result.stderr : ''}`);
      // if oc version failed we're dealing with oc < 4.1
      result = RunnerHandler.execOcSync(ocPath, 'version');
    }

    if (!result || !result.stdout) {
      tl.debug('stdout empty');
      return undefined;
    }

    tl.debug(`stdout ${result.stdout}`);
    const regexVersion = new RegExp('v[0-9]+.[0-9]+.[0-9]+');
    const versionObj = regexVersion.exec(result.stdout);

    if (versionObj && versionObj.length > 0) {
      return versionObj[0];
    }

    return undefined;
  }

  static getOcUtils(): { [key: string]: string } {
    const rawData = fs.readFileSync(
      path.resolve(__dirname || '', 'oc-utils.json'),
      'utf-8'
    );
    return JSON.parse(rawData.toString());
  }
}
