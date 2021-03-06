/*-----------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE file in the project root for license information.
 *-----------------------------------------------------------------------------------------------*/
import { ConfigMap } from '../src/config-map';

const {expect} = require('chai');

describe('ConfigMap', () => {
  describe('#constructor', () => {
    it('creates named ConfigMap', () => {
      const configMap = new ConfigMap('foo', '');
      expect(configMap).to.be.instanceof(ConfigMap);
      expect(configMap.name).to.be.eq('foo');
    });
  });

  describe('#patchCmd', () => {
    process.env.MY_VAR = 'foo';

    after(() => {
      delete process.env.MY_VAR;
    });

    it('creates oc patch command from properties', () => {
      const configMap = new ConfigMap(
        'foo',
        '-key1 value1 -key2 value2 -key3 value3'
      );
      expect(configMap.patchCmd('')).to.be.eq(
        'patch configmap foo -p \'{"data":{"key1": "value1", "key2": "value2", "key3": "value3"}}\''
      );
    });

    it('creates oc patch command with namespace', () => {
      const configMap = new ConfigMap('foo', '-key1 value1');
      expect(configMap.patchCmd('my-space')).to.be.eq(
        'patch configmap foo -p \'{"data":{"key1": "value1"}}\' -n my-space'
      );
    });

    it('interpolates environment variables', () => {
      const configMap = new ConfigMap('foo', '-key1 ${MY_VAR}');
      expect(configMap.patchCmd('my-space')).to.be.eq(
        'patch configmap foo -p \'{"data":{"key1": "foo"}}\' -n my-space'
      );
    });

    it('no properties results in noop patch command', () => {
      const configMap = new ConfigMap('foo', '');
      expect(configMap.patchCmd('')).to.be.eq(
        'patch configmap foo -p \'{"data":{}}\''
      );
    });

    it('removes quotes around properties values', () => {
      const configMap = new ConfigMap('foo', '-key "what now"');
      expect(configMap.patchCmd('')).to.be.eq(
        'patch configmap foo -p \'{"data":{"key": "what now"}}\''
      );
    });
  });
});
