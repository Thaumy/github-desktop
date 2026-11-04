{
  inputs = {
    pkgs.url = "github:NixOS/nixpkgs/89570f24e97e614aa34aa9ab1c927b6578a43775"; # 26-6-23
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
        devShells.default = with pkgs; mkShell {
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

        packages.default = with pkgs; github-desktop.overrideAttrs (_: {
          src = ./.;
          cacheRoot = fetchYarnDeps {
            name = "github-desktop-cache-root";
            yarnLock = ./yarn.lock;
            hash = "sha256-OJDxq1Yep3swLU87YyJz7WfpPzpxo5ISukB4pIwxJBA=";
          };
          cacheApp = fetchYarnDeps {
            name = "github-desktop-cache-app";
            yarnLock = ./app/yarn.lock;
            hash = "sha256-9IWvtItxY6eUa8APuVw5xspSU0BDmtqV+KmUvQYsAeI=";
          };
        });
      });
}
