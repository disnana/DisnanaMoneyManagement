const { withAppBuildGradle } = require('expo/config-plugins');

const marker = '// Mane Android dependency constraints';
const constraints = `
${marker}
dependencies {
    constraints {
        implementation('com.google.code.gson:gson:2.13.2') { because 'GHSA-4jrv-ppp4-jm57' }
        implementation('com.google.guava:guava:33.7.2-android') { because 'GHSA-xxph-c9ww-hj94' }
        implementation('commons-io:commons-io:2.22.0') { because 'GHSA-78wr-2p64-hpwj' }
        implementation('com.squareup.okio:okio:3.16.0') { because 'GHSA-w33c-445m-f8w7' }
    }
}
`;

module.exports = function withAndroidDependencyConstraints(config) {
  return withAppBuildGradle(config, (result) => {
    if (result.modResults.language !== 'groovy') {
      throw new Error('Android dependency constraints require the Expo Groovy app build');
    }
    if (!result.modResults.contents.includes(marker)) {
      result.modResults.contents += constraints;
    }
    return result;
  });
};
