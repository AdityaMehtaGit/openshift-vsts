'use strict';

import tl = require('vsts-task-lib/task');
import { ToolRunner } from 'vsts-task-lib/toolrunner';

const sub = require('substituter');
const split = require('argv-split');

/**
 * Prepares oc for execution and runs the specified command.
 *
 * @param ocPath absolute path to the oc binary
 * @param argLine the command to run
 */
export async function execOc(ocPath: string, argLine: string): Promise<void> {
  let oc: ToolRunner = tl.tool(ocPath);
  for (let arg of prepareOcArguments(argLine)) {
    oc.arg(arg);
  }
  await oc.exec();
  return;
}

/**
 * Splits the specified argument line into tokens and interpolates potential environment variables.
 *
 * @param argLine The command line arguments as single string
 * @return array of arguments with potential environment variables interpolated
 */
export function prepareOcArguments(argLine: string): string[] {
  let interpolatedArgs = sub(argLine, process.env);
  return split(interpolatedArgs);
}
