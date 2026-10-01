"""Points phonemizer at Homebrew's espeak-ng (the espeakng-loader wheel has a broken data path on macOS)."""
import espeakng_loader
espeakng_loader.get_library_path = lambda: '/opt/homebrew/lib/libespeak-ng.dylib'
espeakng_loader.get_data_path = lambda: '/opt/homebrew/share/espeak-ng-data'
from phonemizer.backend.espeak.wrapper import EspeakWrapper
EspeakWrapper.set_library('/opt/homebrew/lib/libespeak-ng.dylib')
EspeakWrapper.set_data_path('/opt/homebrew/share/espeak-ng-data')
