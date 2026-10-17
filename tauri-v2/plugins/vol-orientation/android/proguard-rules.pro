# Komutlar yansımayla (@Command metot adı) bulunur; küçültme adları değiştirirse
# `run_mobile_plugin("setOrientation")` release APK'da karşılıksız kalır.
-keep class com.volstudio.orientation.** { *; }
