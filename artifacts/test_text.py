import sys
sys.path.insert(0, 'e:/projects_window/reader-hub/scrapling')
import parsers
from scrapling import Adaptor

html = '<h3 class="title" itemprop="name">Test Title</h3>'
a = Adaptor(html)
res = a.css('h3.title')
el = res[0]
print("el type:", type(el))
print("el._root:", el._root)
print("el._root.tag:", el._root.tag)
print("el._root.text:", el._root.text)
print("el._root.text_content():", el._root.text_content())
print("el.text:", el.text)
print("el.text type:", type(el.text))
print("bool(el.text):", bool(el.text))
