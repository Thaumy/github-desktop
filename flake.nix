{
  inputs = {
    pkgs.url = "github:NixOS/nixpkgs/295c3f1c2ac1a55504373727cd6cafb26fb6b047"; # 26-5-23
    flake-utils.url = "github:numtide/flake-utils/11707dc2f618dd54ca8739b309ec4fc024de578b"; # 24-11-14
    self.submodules = true;
  };

  outputs = inputs: inputs.flake-utils.lib.eachSystem
    [ "x86_64-linux" "aarch64-darwin" ]
    (system:
      let
        pkgs = import inputs.pkgs { inherit system; };
      in
      {
        devShells = {
          default = with pkgs; mkShell {
            packages =
              [
                nodejs_24
                (yarn.override { nodejs = nodejs_24; })
                python3 # node-gyp (native modules: keytar, desktop-trampoline, fs-admin, …)
                node-gyp
                pkg-config
                git
                git-lfs
              ]
              ++ lib.optionals stdenv.isLinux [
                # Needed to build/run the credential + Electron bits on Linux.
                libsecret
                gnome-keyring
              ];

            shellHook = ''
              export npm_config_python="${python3}/bin/python3"
              echo "GitHub Desktop dev shell — node $(node -v), yarn $(yarn -v)"
              echo "First time:  yarn && yarn build:dev && yarn start"
            '';
          };
        };

        pkg = with pkgs; github-desktop.overrideAttrs (_: finalAttrs: {
          src = ./.;
          cacheRoot = fetchYarnDeps {
            name = "${finalAttrs.pname}-cache-root";
            yarnLock = finalAttrs.src + "/yarn.lock";
            hash = "sha256-OJDxq1Yep3swLU87YyJz7WfpPzpxo5ISukB4pIwxJBA=";
          };
          cacheApp = fetchYarnDeps {
            name = "${finalAttrs.pname}-cache-app";
            yarnLock = finalAttrs.src + "/app/yarn.lock";
            hash = "sha256-DYUlLNxWn4sn7PBir/miJUoDVAQ2/nbOVGWSGN+IPxw=";
          };
        });
      });
}
